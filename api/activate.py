"""Vercel Serverless Function: POST /api/activate

Auto-activates a license key from a Lemon Squeezy order ID.
Called after Checkout.Success postMessage to enable zero-friction PDF download.
Falls back gracefully — if this fails, the user can still paste their key manually.
"""

import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.request import Request, urlopen

LS_API_BASE = "https://api.lemonsqueezy.com"
LS_LICENSE_URL = f"{LS_API_BASE}/v1/licenses"

# Map LS variant IDs to plan names (shared with verify.py)
VARIANT_PLANS = {
    "1303798": "single",
    "1303800": "pack10",
    "1303802": "annual",
}

ALLOWED_ORIGINS = {"https://word2stitch.vercel.app"}
if os.environ.get("VERCEL_ENV") != "production":
    ALLOWED_ORIGINS.add("http://localhost:8042")

MAX_RETRIES = 3
RETRY_DELAY = 1.5


def cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    return {}


def _ls_api_get(path):
    """GET from LS API (requires API key)."""
    api_key = os.environ.get("LEMONSQUEEZY_API_KEY", "")
    req = Request(f"{LS_API_BASE}{path}", method="GET")
    req.add_header("Accept", "application/vnd.api+json")
    req.add_header("Authorization", f"Bearer {api_key}")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _ls_license_post(action, data):
    """POST form-encoded data to LS License API (public, no auth)."""
    from urllib.parse import urlencode

    body = urlencode(data).encode()
    req = Request(f"{LS_LICENSE_URL}/{action}", data=body, method="POST")
    req.add_header("Accept", "application/json")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _mask_email(email):
    if not email or "@" not in email:
        return ""
    local, domain = email.rsplit("@", 1)
    masked = local[0] + "***" if len(local) > 1 else "***"
    return f"{masked}@{domain}"


def _fetch_license_key(order_id):
    """Fetch the first license key for an order, with retries for race conditions."""
    for attempt in range(MAX_RETRIES):
        result = _ls_api_get(f"/v1/orders/{order_id}?include=license-keys")
        included = result.get("included", [])
        for item in included:
            if item.get("type") == "license-keys":
                key = item.get("attributes", {}).get("key")
                if key:
                    return key
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY)
    return None


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

        try:
            MAX_BODY = 4096
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY or length < 0:
                self._json(413, {"allowed": False, "error": "payload_too_large"}, headers)
                return
            body = json.loads(self.rfile.read(length)) if length else {}
        except (json.JSONDecodeError, ValueError):
            self._json(400, {"allowed": False, "error": "invalid_body"}, headers)
            return

        order_id = body.get("order_id", "")
        if not order_id:
            self._json(400, {"allowed": False, "error": "missing_order_id"}, headers)
            return

        if not os.environ.get("LEMONSQUEEZY_API_KEY"):
            self._json(503, {"allowed": False, "error": "not_configured"}, headers)
            return

        # Fetch license key from order (with retries)
        try:
            key = _fetch_license_key(order_id)
        except (HTTPError, Exception):
            self._json(502, {"allowed": False, "error": "order_lookup_failed"}, headers)
            return

        if not key:
            self._json(200, {"allowed": False, "error": "no_license_key"}, headers)
            return

        # Validate the key
        try:
            result = _ls_license_post("validate", {"license_key": key})
        except (HTTPError, Exception):
            self._json(502, {"allowed": False, "error": "validation_failed"}, headers)
            return

        if not result.get("valid"):
            self._json(200, {"allowed": False, "error": "invalid_key"}, headers)
            return

        lk = result.get("license_key", {})
        meta = result.get("meta", {})

        # Activate one credit
        try:
            instance = f"download-{uuid.uuid4().hex[:12]}"
            _ls_license_post("activate", {"license_key": key, "instance_name": instance})
        except (HTTPError, Exception):
            self._json(502, {"allowed": False, "error": "activation_failed"}, headers)
            return

        limit = lk.get("activation_limit")
        usage = lk.get("activation_usage", 0)
        remaining = -1 if limit is None else limit - usage - 1
        plan = VARIANT_PLANS.get(str(meta.get("variant_id", "")), "unknown")

        self._json(
            200,
            {
                "allowed": True,
                "license_key": key,
                "remaining": remaining,
                "plan": plan,
                "email": _mask_email(meta.get("customer_email", "")),
            },
            headers,
        )

    def _json(self, status, data, extra_headers=None):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
