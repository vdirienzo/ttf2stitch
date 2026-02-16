"""Vercel Serverless Function: POST /api/check

Read-only license key validation — checks status and remaining credits
WITHOUT consuming an activation. Used by initAuth on page load to display
credit count without burning downloads.
"""

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

        # Rate limit: 30 requests per minute per IP
        client_ip = (
            self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        )
        if not check_rate_limit(client_ip, "check", max_requests=30, window_seconds=60):
            json_response(self, 429, {"valid": False, "error": "rate_limited"}, headers)
            return

        body, err = read_body(self)
        if err == "payload_too_large":
            json_response(self, 413, {"valid": False, "error": err}, headers)
            return
        if err:
            json_response(self, 400, {"valid": False, "error": err}, headers)
            return

        key = body.get("license_key", "").strip()
        if not key:
            json_response(self, 400, {"valid": False, "error": "missing_key"}, headers)
            return

        # Validate only — no activation
        try:
            result = ls_license_post("validate", {"license_key": key})
        except (HTTPError, Exception):
            json_response(self, 502, {"valid": False, "error": "validation_failed"}, headers)
            return

        if not result.get("valid"):
            json_response(self, 200, {"valid": False, "error": "invalid_key"}, headers)
            return

        lk = result.get("license_key", {})
        meta = result.get("meta", {})

        if lk.get("status") == "expired":
            json_response(self, 200, {"valid": False, "error": "expired"}, headers)
            return

        limit = lk.get("activation_limit")
        usage = lk.get("activation_usage", 0)
        remaining = -1 if limit is None else limit - usage
        plan = VARIANT_PLANS.get(str(meta.get("variant_id", "")), "unknown")

        json_response(
            self,
            200,
            {
                "valid": True,
                "remaining": remaining,
                "plan": plan,
                "email": mask_email(meta.get("customer_email", "")),
            },
            headers,
        )
