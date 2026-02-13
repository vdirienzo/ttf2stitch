"""Vercel Serverless Function: POST /api/webhook

Receives Lemon Squeezy webhook events with HMAC-SHA256 signature verification.
Logs event metadata for debugging; responds 200 immediately.
"""

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._respond(405, {"error": "Method not allowed"})

    def do_POST(self):
        signature = self.headers.get("X-Signature", "")

        # Verify secret is configured BEFORE reading body
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

        # Parse and log event
        try:
            data = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            self._respond(400, {"error": "invalid JSON"})
            return

        meta = data.get("meta", {})
        event = meta.get("event_name", "unknown")
        print(f"[webhook] {event}: {json.dumps(meta)}")

        self._respond(200, {"ok": True})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
