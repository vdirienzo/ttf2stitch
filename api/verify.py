"""Vercel Serverless Function: POST /api/verify

Validates a Lemon Squeezy license key and activates one credit.
Uses the LS License API (public, no API key needed).
"""

import uuid
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError

from _shared import (
    VARIANT_PLANS,
    check_rate_limit,
    cors_headers,
    json_response,
    ls_license_post,
    mask_email,
    read_body,
)


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

        # Rate limit: 20 requests per minute per IP
        client_ip = (
            self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        )
        if not check_rate_limit(client_ip, "verify", max_requests=20, window_seconds=60):
            json_response(self, 429, {"allowed": False, "error": "rate_limited"}, headers)
            return

        body, err = read_body(self)
        if err == "payload_too_large":
            json_response(self, 413, {"allowed": False, "error": err}, headers)
            return
        if err:
            json_response(self, 400, {"allowed": False, "error": err}, headers)
            return

        key = body.get("license_key", "").strip()
        if not key:
            json_response(self, 400, {"allowed": False, "error": "missing_key"}, headers)
            return

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

        if lk.get("status") == "expired":
            json_response(self, 200, {"allowed": False, "error": "expired"}, headers)
            return

        limit = lk.get("activation_limit")
        usage = lk.get("activation_usage", 0)
        if limit is not None and usage >= limit:
            json_response(self, 200, {"allowed": False, "error": "exhausted"}, headers)
            return

        # Activate one credit
        try:
            instance = f"download-{uuid.uuid4().hex[:12]}"
            ls_license_post("activate", {"license_key": key, "instance_name": instance})
        except (HTTPError, Exception):
            json_response(self, 502, {"allowed": False, "error": "activation_failed"}, headers)
            return

        remaining = -1 if limit is None else limit - usage - 1
        plan = VARIANT_PLANS.get(str(meta.get("variant_id", "")), "unknown")

        json_response(
            self,
            200,
            {
                "allowed": True,
                "remaining": remaining,
                "plan": plan,
                "email": mask_email(meta.get("customer_email", "")),
            },
            headers,
        )
