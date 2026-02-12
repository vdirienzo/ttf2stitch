"""Vercel Serverless Function: POST /api/webhook

Handles Stripe webhook events to update user plan status in Clerk.
Events handled:
  - checkout.session.completed → set user plan to "pro"
  - customer.subscription.deleted → set user plan to "free"
"""

import json
import logging
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

import stripe  # noqa: E402
from server_utils import json_error, json_response  # noqa: E402

logger = logging.getLogger("ttf2stitch.webhook")

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")


def _update_clerk_user_metadata(user_id: str, public_metadata: dict) -> bool:
    """Update a Clerk user's public_metadata via the Clerk Backend API."""
    if not CLERK_SECRET_KEY or not user_id:
        return False
    try:
        url = f"https://api.clerk.com/v1/users/{user_id}"
        data = json.dumps({"public_metadata": public_metadata}).encode()
        req = urllib.request.Request(
            url,
            data=data,
            method="PATCH",
            headers={
                "Authorization": f"Bearer {CLERK_SECRET_KEY}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            return resp.status == 200
    except Exception:
        logger.exception("Failed to update Clerk user %s", user_id)
        return False


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read raw body for signature verification
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 1_000_000:
            json_error(self, "Payload too large", 413)
            return

        raw_body = self.rfile.read(content_length)
        sig_header = self.headers.get("Stripe-Signature", "")

        # Verify webhook signature
        if WEBHOOK_SECRET:
            try:
                event = stripe.Webhook.construct_event(raw_body, sig_header, WEBHOOK_SECRET)
            except stripe.SignatureVerificationError:
                json_error(self, "Invalid signature", 400)
                return
            except Exception as e:
                json_error(self, f"Webhook error: {e}", 400)
                return
        else:
            # No secret configured — parse without verification (dev only)
            try:
                event = json.loads(raw_body)
            except json.JSONDecodeError:
                json_error(self, "Invalid JSON", 400)
                return

        event_type = event.get("type", "")

        if event_type == "checkout.session.completed":
            session = event.get("data", {}).get("object", {})
            clerk_user_id = session.get("metadata", {}).get("clerk_user_id")
            customer_id = session.get("customer")
            subscription_id = session.get("subscription")

            if clerk_user_id:
                _update_clerk_user_metadata(
                    clerk_user_id,
                    {
                        "plan": "pro",
                        "stripe_customer_id": customer_id,
                        "stripe_subscription_id": subscription_id,
                    },
                )
                logger.info("User %s upgraded to pro", clerk_user_id)

        elif event_type == "customer.subscription.deleted":
            subscription = event.get("data", {}).get("object", {})
            clerk_user_id = subscription.get("metadata", {}).get("clerk_user_id")

            if clerk_user_id:
                _update_clerk_user_metadata(
                    clerk_user_id,
                    {
                        "plan": "free",
                        "stripe_customer_id": None,
                        "stripe_subscription_id": None,
                    },
                )
                logger.info("User %s downgraded to free", clerk_user_id)

        json_response(self, {"received": True})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature")
        self.end_headers()
