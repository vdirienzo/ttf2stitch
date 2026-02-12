"""Vercel Serverless Function: POST /api/checkout

Creates a Lemon Squeezy checkout with a redirect URL back to the app.
Uses the LS Checkouts API so the user is auto-redirected after payment.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.request import Request, urlopen

LS_API_KEY = os.environ.get("LEMONSQUEEZY_API_KEY", "").strip()

# Store ID (infinis) and variant IDs from LS dashboard
STORE_ID = "291180"
VARIANTS = {
    "onetime": "1300617",
    "subscribe": "1300610",
}

ALLOWED_ORIGINS = {
    "https://word2stitch.vercel.app",
    "http://localhost:8042",
}


def cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    return {}


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

        if not LS_API_KEY:
            self._json(500, {"error": "LEMONSQUEEZY_API_KEY not configured"}, headers)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except (json.JSONDecodeError, ValueError):
            self._json(400, {"error": "Invalid JSON body"}, headers)
            return

        plan = body.get("plan", "onetime")
        variant_id = VARIANTS.get(plan)
        if not variant_id:
            self._json(400, {"error": f"Unknown plan: {plan}"}, headers)
            return

        # Build return URL from Origin header (works for localhost + prod)
        return_origin = origin if origin in ALLOWED_ORIGINS else "https://word2stitch.vercel.app"
        redirect_url = f"{return_origin}/?payment=success"

        # Create checkout via LS API with redirect_url
        checkout_data = json.dumps(
            {
                "data": {
                    "type": "checkouts",
                    "attributes": {
                        "product_options": {
                            "redirect_url": redirect_url,
                        },
                        "checkout_options": {
                            "embed": True,
                            "accent_color": "#b83a2a",
                            "button_color": "#b83a2a",
                        },
                        "checkout_data": {
                            "custom": {"source": "word2stitch"},
                        },
                    },
                    "relationships": {
                        "store": {"data": {"type": "stores", "id": STORE_ID}},
                        "variant": {"data": {"type": "variants", "id": variant_id}},
                    },
                }
            }
        ).encode()

        req = Request(
            "https://api.lemonsqueezy.com/v1/checkouts",
            data=checkout_data,
            headers={
                "Authorization": f"Bearer {LS_API_KEY}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            method="POST",
        )

        try:
            with urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                checkout_url = result["data"]["attributes"]["url"]
                self._json(200, {"url": checkout_url}, headers)
        except HTTPError as e:
            error_body = e.read().decode() if e.fp else str(e)
            self._json(e.code, {"error": "LS API error", "detail": error_body}, headers)
        except Exception as e:
            self._json(500, {"error": str(e)}, headers)

    def _json(self, status, data, extra_headers=None):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
