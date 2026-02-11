"""Vercel Serverless Function: POST /api/rasterize

Rasterizes a TTF/OTF font at a given stitch height using ttf2stitch.
"""

import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Add src/ and project root to Python path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from server_utils import do_rasterize, json_error, json_response, read_json_body  # noqa: E402

FONTS_DIR = str(PROJECT_ROOT / "fonts")

# Module-level cache (persists across warm invocations)
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            return

        font_file = body.get("font", "")
        if not font_file or ".." in font_file or "/" in font_file:
            json_error(self, f"Invalid font filename: '{font_file}'", 400)
            return

        height = body.get("height", 12)
        if not isinstance(height, int) or height < 4 or height > 60:
            json_error(self, "height must be an integer between 4 and 60", 400)
            return

        bold = body.get("bold", 0)
        if not isinstance(bold, int) or bold < 0 or bold > 3:
            json_error(self, "bold must be 0, 1, 2, or 3", 400)
            return

        strategy = body.get("strategy", "average")
        if strategy not in ("average", "max-ink"):
            json_error(self, "strategy must be 'average' or 'max-ink'", 400)
            return

        try:
            font_json = do_rasterize(
                font_file,
                height,
                bold,
                strategy,
                fonts_dir=FONTS_DIR,
                cache=_rasterize_cache,
            )
            json_response(self, font_json)
        except FileNotFoundError as e:
            json_error(self, str(e), 404)
        except Exception as e:
            json_error(self, f"Rasterization failed: {e}", 500)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
