"""Vercel Serverless Function: POST /api/webhook

Receives Lemon Squeezy webhook events with HMAC-SHA256 signature verification.
Processes order_created, subscription_expired, order_refunded events.
Uses in-memory idempotency set (resets on cold start — acceptable for serverless).
"""

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")

# In-memory idempotency (prevents duplicate processing within same instance)
_processed_events = set()
_MAX_EVENTS = 10000  # cap to prevent unbounded growth


def _process_order_created(data):
    """Log order creation for audit trail."""
    attrs = data.get("data", {}).get("attributes", {})
    meta = data.get("meta", {})
    order_id = attrs.get("order_number", attrs.get("id", "unknown"))
    email = attrs.get("user_email", "unknown")
    total = attrs.get("total_formatted", "?")
    custom = meta.get("custom_data", {})
    source = custom.get("source", "unknown") if isinstance(custom, dict) else "unknown"
    print(f"[webhook] ORDER_CREATED: order={order_id} email={email} total={total} source={source}")


def _process_subscription_expired(data):
    """Log subscription expiration for awareness."""
    attrs = data.get("data", {}).get("attributes", {})
    user_email = attrs.get("user_email", "unknown")
    product = attrs.get("product_name", "unknown")
    print(f"[webhook] SUBSCRIPTION_EXPIRED: email={user_email} product={product}")


def _process_order_refunded(data):
    """Log refund for manual follow-up."""
    attrs = data.get("data", {}).get("attributes", {})
    order_id = attrs.get("order_number", attrs.get("id", "unknown"))
    email = attrs.get("user_email", "unknown")
    total = attrs.get("total_formatted", "?")
    print(
        f"[webhook] ORDER_REFUNDED: order={order_id} email={email}"
        f" total={total} — manual follow-up needed"
    )


_EVENT_HANDLERS = {
    "order_created": _process_order_created,
    "subscription_expired": _process_subscription_expired,
    "order_refunded": _process_order_refunded,
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._respond(405, {"error": "Method not allowed"})

    def do_POST(self):
        signature = self.headers.get("X-Signature", "")

        if not WEBHOOK_SECRET:
            print("[webhook] WARNING: LEMONSQUEEZY_WEBHOOK_SECRET not configured")
            self._respond(500, {"error": "webhook secret not configured"})
            return

        MAX_BODY = 65536
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY or length < 0:
            self._respond(413, {"error": "Payload too large"})
            return
        raw_body = self.rfile.read(length)

        expected = hmac.new(WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(signature, expected):
            print("[webhook] Signature mismatch — rejecting request")
            self._respond(401, {"error": "invalid signature"})
            return

        try:
            data = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            self._respond(400, {"error": "invalid JSON"})
            return

        meta = data.get("meta", {})
        event_name = meta.get("event_name", "unknown")
        event_id = meta.get("webhook_id", "")

        # Idempotency: skip already-processed events
        if event_id and event_id in _processed_events:
            print(f"[webhook] Duplicate event skipped: {event_name} id={event_id}")
            self._respond(200, {"ok": True, "skipped": True})
            return

        # Route to handler
        event_handler = _EVENT_HANDLERS.get(event_name)
        if event_handler:
            event_handler(data)
        else:
            print(f"[webhook] Unhandled event: {event_name} meta={json.dumps(meta)}")

        # Mark as processed (with cap to prevent unbounded growth)
        if event_id:
            if len(_processed_events) >= _MAX_EVENTS:
                _processed_events.clear()
            _processed_events.add(event_id)

        self._respond(200, {"ok": True})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
