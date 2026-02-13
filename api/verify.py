"""Vercel Serverless Function: POST /api/verify

Validates a Lemon Squeezy license key and activates one credit.
Uses the LS License API (public, no API key needed).
"""

import json
import os
import uuid
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LS_LICENSE_URL = "https://api.lemonsqueezy.com/v1/licenses"

# Map LS variant IDs to plan names
VARIANT_PLANS = {
    "827221": "single",
    "827222": "pack10",
    "827223": "annual",
}

ALLOWED_ORIGINS = {"https://word2stitch.vercel.app"}
if os.environ.get("VERCEL_ENV") != "production":
    ALLOWED_ORIGINS.add("http://localhost:8042")


def cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    return {}


def _ls_post(path, data):
    """POST form-encoded data to LS License API (public, no auth)."""
    body = urlencode(data).encode()
    req = Request(f"{LS_LICENSE_URL}/{path}", data=body, method="POST")
    req.add_header("Accept", "application/json")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _mask_email(email):
    if not email or "@" not in email:
        return ""
    local, domain = email.rsplit("@", 1)
    masked = local[0] + "***" if len(local) > 1 else "***"
    return f"{masked}@{domain}"


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

        key = body.get("license_key", "").strip()
        if not key:
            self._json(400, {"allowed": False, "error": "missing_key"}, headers)
            return

        try:
            result = _ls_post("validate", {"license_key": key})
        except (HTTPError, Exception):
            self._json(502, {"allowed": False, "error": "validation_failed"}, headers)
            return

        if not result.get("valid"):
            self._json(200, {"allowed": False, "error": "invalid_key"}, headers)
            return

        lk = result.get("license_key", {})
        meta = result.get("meta", {})

        if lk.get("status") == "expired":
            self._json(200, {"allowed": False, "error": "expired"}, headers)
            return

        limit = lk.get("activation_limit")
        usage = lk.get("activation_usage", 0)
        if limit is not None and usage >= limit:
            self._json(200, {"allowed": False, "error": "exhausted"}, headers)
            return

        # Activate one credit
        try:
            instance = f"download-{uuid.uuid4().hex[:12]}"
            _ls_post("activate", {"license_key": key, "instance_name": instance})
        except (HTTPError, Exception):
            self._json(502, {"allowed": False, "error": "activation_failed"}, headers)
            return

        remaining = -1 if limit is None else limit - usage - 1
        plan = VARIANT_PLANS.get(str(meta.get("variant_id", "")), "unknown")

        self._json(
            200,
            {
                "allowed": True,
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
