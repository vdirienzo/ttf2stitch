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

from server_utils import FONT_EXTENSIONS, classify_font  # noqa: E402

FONTS_DIR = PROJECT_ROOT / "fonts"

# Module-level cache (persists across warm invocations)
_cached_response: str | None = None


def _build_font_list() -> list[dict]:
    """Scan fonts directory and build classified font list."""
    fonts = []
    if not FONTS_DIR.is_dir():
        return fonts

    for entry in sorted(FONTS_DIR.iterdir()):
        if entry.suffix.lower() in FONT_EXTENSIONS and entry.is_file():
            fonts.append(
                {
                    "file": entry.name,
                    "name": entry.stem,
                    "size": entry.stat().st_size,
                    "category": classify_font(str(entry)),
                }
            )
    return fonts


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _cached_response
        if _cached_response is None:
            _cached_response = json.dumps(_build_font_list())

        body = _cached_response.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, s-maxage=3600")
        self.end_headers()
        self.wfile.write(body)
