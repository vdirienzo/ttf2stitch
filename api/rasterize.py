"""Vercel Serverless Function: POST /api/rasterize

Rasterizes a TTF/OTF font at a given stitch height using ttf2stitch.
Requires Clerk JWT authentication when CLERK_FRONTEND_API is configured.
"""

import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Add src/ and project root to Python path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from auth_utils import get_bearer_token, is_auth_enabled, verify_token  # noqa: E402
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


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Verify Clerk JWT if auth is configured
        if is_auth_enabled():
            token = get_bearer_token(self)
            if not token:
                json_error(self, "Authentication required", 401)
                return
            claims = verify_token(token)
            if claims is None:
                json_error(self, "Invalid or expired token", 401)
                return

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
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
