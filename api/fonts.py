"""Vercel Serverless Function: GET /api/fonts

Lists available TTF/OTF fonts with classification metadata.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Ensure project root is importable for server_utils
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server_utils import list_fonts  # noqa: E402

FONTS_DIR = str(PROJECT_ROOT / "fonts")

# Module-level cache (persists across warm invocations)
_cached_response: str | None = None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _cached_response
        if _cached_response is None:
            _cached_response = json.dumps(list_fonts(FONTS_DIR))

        body = _cached_response.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, s-maxage=3600")
        self.end_headers()
        self.wfile.write(body)
