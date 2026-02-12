"""Vercel Serverless Function: POST /api/checkout

Creates a Stripe Checkout Session for Word2Stitch Pro subscription.
Requires Clerk JWT authentication.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

import stripe  # noqa: E402
from auth_utils import get_bearer_token, is_auth_enabled, verify_token  # noqa: E402
from server_utils import json_error, json_response, read_json_body  # noqa: E402

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Require authentication
        if is_auth_enabled():
            token = get_bearer_token(self)
            if not token:
                json_error(self, "Authentication required", 401)
                return
            claims = verify_token(token)
            if claims is None:
                json_error(self, "Invalid or expired token", 401)
                return
        else:
            claims = {}

        body = read_json_body(self) or {}
        success_url = body.get("success_url", "https://word2stitch.vercel.app/?payment=success")
        cancel_url = body.get("cancel_url", "https://word2stitch.vercel.app/?payment=cancelled")

        user_id = claims.get("sub", "anonymous")

        try:
            session = stripe.checkout.Session.create(
                mode="subscription",
                payment_method_types=["card"],
                line_items=[{"price": PRICE_ID, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"clerk_user_id": user_id},
                subscription_data={"metadata": {"clerk_user_id": user_id}},
            )
            json_response(self, {"url": session.url, "session_id": session.id})
        except stripe.StripeError as e:
            json_error(self, f"Stripe error: {e.user_message or str(e)}", 400)
        except Exception as e:
            json_error(self, f"Checkout failed: {e}", 500)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
