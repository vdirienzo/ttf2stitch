"""Vercel Serverless Function: POST /api/checkout

Creates a Lemon Squeezy checkout with a redirect URL back to the app.
Uses the LS Checkouts API so the user is auto-redirected after payment.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from _shared import (
    ALLOWED_ORIGINS,
    check_rate_limit,
    cors_headers,
    json_response,
    read_body,
)

LS_API_KEY = os.environ.get("LEMONSQUEEZY_API_KEY", "").strip()

# Store ID (infinis) and variant IDs from LS dashboard
STORE_ID = "291180"
VARIANTS = {
    "single": "1303798",  # $1.99 one-time
    "pack10": "1303800",  # $9.99 one-time
    "annual": "1303802",  # $24.99/year subscription
}
# Legacy aliases (backward compat with existing frontend)
VARIANTS["onetime"] = VARIANTS["single"]
VARIANTS["subscribe"] = VARIANTS["annual"]


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

        # Rate limit: 5 requests per minute per IP
        client_ip = (
            self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        )
        if not check_rate_limit(client_ip, "checkout", max_requests=5, window_seconds=60):
            json_response(self, 429, {"error": "rate_limited"}, headers)
            return

        if not LS_API_KEY:
            json_response(self, 500, {"error": "Service configuration error"}, headers)
            return

        body, err = read_body(self)
        if err == "payload_too_large":
            json_response(self, 413, {"error": "Payload too large"}, headers)
            return
        if err:
            json_response(self, 400, {"error": "Invalid JSON body"}, headers)
            return

        plan = body.get("plan", "onetime")
        variant_id = VARIANTS.get(plan)
        if not variant_id:
            json_response(self, 400, {"error": f"Unknown plan: {plan}"}, headers)
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
                            "button_color": "#b83a2a",
                            "active_state_color": "#b83a2a",
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
                json_response(self, 200, {"url": checkout_url}, headers)
        except HTTPError as e:
            error_body = e.read().decode() if e.fp else str(e)
            print(f"[checkout] LS API error: {error_body}")
            json_response(self, 502, {"error": "Payment service temporarily unavailable"}, headers)
        except Exception as e:
            print(f"[checkout] Unexpected error: {e}")
            json_response(self, 500, {"error": "Internal server error"}, headers)
