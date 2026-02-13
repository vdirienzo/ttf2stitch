"""Vercel Serverless Function: POST /api/rasterize

Rasterizes a TTF/OTF font at a given stitch height using ttf2stitch.
Public endpoint — no authentication required.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Add src/ and project root to Python path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from server_utils import (  # noqa: E402
    do_rasterize,
    etag_for_json,
    json_error,
    json_response,
    read_json_body,
    validate_rasterize_params,
)

FONTS_DIR = str(PROJECT_ROOT / "fonts")

# Module-level cache (persists across warm invocations)
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}

ALLOWED_ORIGINS = {"https://word2stitch.vercel.app"}
if os.environ.get("VERCEL_ENV") != "production":
    ALLOWED_ORIGINS.add("http://localhost:8042")


def _cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    return {}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            return

        params, error = validate_rasterize_params(body)
        if error:
            json_error(self, error, 400)
            return

        try:
            font_json = do_rasterize(
                params["font"],
                params["height"],
                params["bold"],
                params["strategy"],
                fonts_dir=FONTS_DIR,
                cache=_rasterize_cache,
            )
            json_response(
                self,
                font_json,
                headers={
                    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
                    "ETag": f'"{etag_for_json(font_json)}"',
                },
            )
        except FileNotFoundError as e:
            json_error(self, str(e), 404)
        except Exception as e:
            json_error(self, f"Rasterization failed: {e}", 500)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        for k, v in _cors_headers(origin).items():
            self.send_header(k, v)
        self.end_headers()
