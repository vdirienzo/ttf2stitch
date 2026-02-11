"""Vercel Serverless Function: POST /api/rasterize

Rasterizes a TTF/OTF font at a given stitch height using ttf2stitch.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# Add src/ to Python path so ttf2stitch package is importable
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

FONTS_DIR = PROJECT_ROOT / "fonts"
FONT_EXTENSIONS = {".ttf", ".otf"}
MAX_BODY_SIZE = 2 * 1024 * 1024  # 2MB

# Module-level cache (persists across warm invocations)
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}


def _do_rasterize(font_file: str, height: int, bold: int, strategy: str) -> dict:
    """Rasterize a font, returning cached result if available."""
    cache_key = (font_file, height, bold, strategy)
    if cache_key in _rasterize_cache:
        return _rasterize_cache[cache_key]

    from ttf2stitch.rasterizer import rasterize_font

    font_path = FONTS_DIR / font_file
    if not font_path.is_file():
        raise FileNotFoundError(f"Font not found: {font_file}")

    ext = font_path.suffix.lower()
    if ext not in FONT_EXTENSIONS:
        raise ValueError(f"Invalid font extension: {ext}")

    result = rasterize_font(
        str(font_path),
        target_height=height,
        bold=bold,
        strategy=strategy,
    )

    font_json = result.font.model_dump_json_v2()
    _rasterize_cache[cache_key] = font_json
    return font_json


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY_SIZE:
            self._json_error(413, "Payload too large")
            return
        if length == 0:
            self._json_error(400, "Empty body")
            return

        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as e:
            self._json_error(400, f"Invalid JSON: {e}")
            return

        font_file = body.get("font", "")
        if not font_file or ".." in font_file or "/" in font_file:
            self._json_error(400, f"Invalid font filename: '{font_file}'")
            return

        height = body.get("height", 12)
        if not isinstance(height, int) or height < 4 or height > 60:
            self._json_error(400, "height must be an integer between 4 and 60")
            return

        bold = body.get("bold", 0)
        if not isinstance(bold, int) or bold < 0 or bold > 3:
            self._json_error(400, "bold must be 0, 1, 2, or 3")
            return

        strategy = body.get("strategy", "average")
        if strategy not in ("average", "max-ink"):
            self._json_error(400, "strategy must be 'average' or 'max-ink'")
            return

        try:
            font_json = _do_rasterize(font_file, height, bold, strategy)
            self._json_response(200, font_json)
        except FileNotFoundError as e:
            self._json_error(404, str(e))
        except Exception as e:
            self._json_error(500, f"Rasterization failed: {e}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _json_response(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, message):
        self._json_response(code, {"error": message})
