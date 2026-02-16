"""Vercel Serverless Function: POST /api/activate

Auto-activates a license key from a Lemon Squeezy order ID.
Called after Checkout.Success postMessage to enable zero-friction PDF download.
Falls back gracefully — if this fails, the user can still paste their key manually.

Security: Requires email verification to prevent order ID enumeration (AV-3).
"""

import os
import re
import time
import uuid
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError

from _shared import (
    VARIANT_PLANS,
    check_rate_limit,
    cors_headers,
    json_response,
    ls_api_get,
    ls_license_post,
    mask_email,
    mask_key,
    read_body,
)

MAX_RETRIES = 3
RETRY_DELAY = 1.5

# Strict pattern: order IDs are numeric only (prevents path traversal)
_ORDER_ID_RE = re.compile(r"^\d{1,20}$")


def _validate_order_id(order_id):
    """Validate order_id is a positive integer string (no path traversal)."""
    return bool(order_id and _ORDER_ID_RE.match(str(order_id)))


def _fetch_order_with_keys(order_id):
    """Fetch order data including license keys."""
    return ls_api_get(f"/v1/orders/{order_id}?include=license-keys")


def _extract_license_key(order_data):
    """Extract the first license key from order response."""
    if not order_data:
        return None
    for attempt in range(MAX_RETRIES):
        included = order_data.get("included", [])
        for item in included:
            if item.get("type") == "license-keys":
                key = item.get("attributes", {}).get("key")
                if key:
                    return key
        # Re-fetch if no key found (race condition with LS)
        order_id = order_data.get("data", {}).get("id")
        if not order_id or attempt >= MAX_RETRIES - 1:
            break
        time.sleep(RETRY_DELAY)
        order_data = ls_api_get(f"/v1/orders/{order_id}?include=license-keys")
    return None


def _get_order_email(order_data):
    """Extract customer email from order data."""
    return order_data.get("data", {}).get("attributes", {}).get("user_email", "").strip().lower()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        for k, v in cors_headers(origin).items():
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get("Origin", "")
        headers = cors_headers(origin)

        # Rate limit: 3 requests per 5 minutes per IP
        client_ip = (
            self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        )
        if not check_rate_limit(client_ip, "activate", max_requests=3, window_seconds=300):
            json_response(self, 429, {"allowed": False, "error": "rate_limited"}, headers)
            return

        body, err = read_body(self)
        if err == "payload_too_large":
            json_response(self, 413, {"allowed": False, "error": err}, headers)
            return
        if err:
            json_response(self, 400, {"allowed": False, "error": err}, headers)
            return

        order_id = str(body.get("order_id", "")).strip()
        email = body.get("email", "").strip().lower()

        if not order_id:
            json_response(self, 400, {"allowed": False, "error": "missing_order_id"}, headers)
            return

        if not email:
            json_response(self, 400, {"allowed": False, "error": "missing_email"}, headers)
            return

        # Sanitize order_id to prevent path traversal
        if not _validate_order_id(order_id):
            json_response(self, 400, {"allowed": False, "error": "invalid_order_id"}, headers)
            return

        if not os.environ.get("LEMONSQUEEZY_API_KEY"):
            json_response(self, 503, {"allowed": False, "error": "not_configured"}, headers)
            return

        # Fetch order data (includes license keys)
        try:
            order_data = _fetch_order_with_keys(order_id)
        except (HTTPError, Exception):
            json_response(self, 502, {"allowed": False, "error": "order_lookup_failed"}, headers)
            return

        # Verify email matches the order's customer email (AV-3 fix)
        order_email = _get_order_email(order_data)
        if not order_email or email != order_email:
            # Generic error to avoid leaking whether order exists
            json_response(self, 403, {"allowed": False, "error": "email_mismatch"}, headers)
            return

        # Extract license key with retries for race conditions
        key = _extract_license_key(order_data)
        if not key:
            json_response(self, 200, {"allowed": False, "error": "no_license_key"}, headers)
            return

        # Validate the key
        try:
            result = ls_license_post("validate", {"license_key": key})
        except (HTTPError, Exception):
            json_response(self, 502, {"allowed": False, "error": "validation_failed"}, headers)
            return

        if not result.get("valid"):
            json_response(self, 200, {"allowed": False, "error": "invalid_key"}, headers)
            return

        lk = result.get("license_key", {})
        meta = result.get("meta", {})

        # Activate one credit
        try:
            instance = f"download-{uuid.uuid4().hex[:12]}"
            ls_license_post("activate", {"license_key": key, "instance_name": instance})
        except (HTTPError, Exception):
            json_response(self, 502, {"allowed": False, "error": "activation_failed"}, headers)
            return

        limit = lk.get("activation_limit")
        usage = lk.get("activation_usage", 0)
        remaining = -1 if limit is None else limit - usage - 1
        plan = VARIANT_PLANS.get(str(meta.get("variant_id", "")), "unknown")

        # NEVER return full license key — masked only (AV-3 fix)
        json_response(
            self,
            200,
            {
                "allowed": True,
                "license_key": mask_key(key),
                "remaining": remaining,
                "plan": plan,
                "email": mask_email(meta.get("customer_email", "")),
            },
            headers,
        )
