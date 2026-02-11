"""Custom HTTP server for ttf2stitch with font rasterization API.

Extends SimpleHTTPRequestHandler to add:
- POST /api/save: Save a font JSON v2 file to output/<id>.json
- POST /api/manifest: Regenerate output/_manifest.json
- GET  /api/fonts: List available TTF/OTF fonts from fonts/ directory
- POST /api/rasterize: Rasterize a TTF font at a given stitch height

All other requests (GET, HEAD) are handled by the default static file server.
"""

import json
import os
import re
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from server_utils import (
    FONT_EXTENSIONS,
    classify_font,
    do_rasterize,
    json_error,
    json_response,
    read_json_body,
)

OUTPUT_DIR = "output"
FONTS_DIR = "fonts"
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$")

# In-memory caches
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}
_font_categories: dict[str, str] = {}


def _get_category(font_path: str) -> str:
    """Get font category, using cache to avoid re-reading font files."""
    if font_path not in _font_categories:
        _font_categories[font_path] = classify_font(font_path)
    return _font_categories[font_path]


def _list_fonts() -> list[dict]:
    """List available TTF/OTF fonts from the fonts directory."""
    fonts = []
    fonts_path = Path(FONTS_DIR)
    if not fonts_path.is_dir():
        return fonts

    for entry in sorted(fonts_path.iterdir()):
        if entry.suffix.lower() in FONT_EXTENSIONS and entry.is_file():
            name = entry.stem  # filename without extension
            fonts.append(
                {
                    "file": entry.name,
                    "name": name,
                    "size": entry.stat().st_size,
                    "category": _get_category(str(entry)),
                }
            )

    return fonts


class FontServerHandler(SimpleHTTPRequestHandler):
    """HTTP handler with font save, list, and rasterization APIs."""

    def do_GET(self):
        if self.path == "/api/fonts":
            self._handle_list_fonts()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/save":
            self._handle_save()
        elif self.path == "/api/manifest":
            self._handle_manifest()
        elif self.path == "/api/rasterize":
            self._handle_rasterize()
        else:
            self.send_error(404, "Not Found")

    def _handle_list_fonts(self):
        fonts = _list_fonts()
        json_response(self, fonts)

    def _handle_rasterize(self):
        body = read_json_body(self)
        if body is None:
            return

        # Extract and validate parameters
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
            t0 = time.monotonic()
            font_json = do_rasterize(
                font_file,
                height,
                bold,
                strategy,
                fonts_dir=FONTS_DIR,
                cache=_rasterize_cache,
            )
            elapsed = time.monotonic() - t0
            self.log_message(
                "Rasterized: %s h=%d bold=%d %s (%.1fs, %d glyphs)",
                font_file,
                height,
                bold,
                strategy,
                elapsed,
                len(font_json.get("glyphs", {})),
            )
            json_response(self, font_json)
        except FileNotFoundError as e:
            json_error(self, str(e), 404)
        except Exception as e:
            json_error(self, f"Rasterization failed: {e}", 500)

    def _handle_save(self):
        body = read_json_body(self)
        if body is None:
            return

        # Validate required fields
        font_id = body.get("id", "")
        if not font_id or not SAFE_ID_RE.match(font_id):
            json_error(self, f"Invalid font id: '{font_id}'", 400)
            return

        if body.get("version") != 2:
            json_error(self, "version must be 2", 400)
            return

        if not isinstance(body.get("glyphs"), dict):
            json_error(self, "glyphs must be an object", 400)
            return

        # Write file
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        filepath = os.path.join(OUTPUT_DIR, f"{font_id}.json")

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
        except OSError as e:
            json_error(self, f"Write failed: {e}", 500)
            return

        # Regenerate manifest
        self._regenerate_manifest()

        json_response(self, {"ok": True, "path": filepath})
        self.log_message("Saved font: %s (%d glyphs)", font_id, len(body["glyphs"]))

    def _handle_manifest(self):
        self._regenerate_manifest()
        json_response(self, {"ok": True})

    def _regenerate_manifest(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        files = sorted(
            f for f in os.listdir(OUTPUT_DIR) if f.endswith(".json") and f != "_manifest.json"
        )
        manifest_path = os.path.join(OUTPUT_DIR, "_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(files, f)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[serve] {fmt % args}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8042
    server = HTTPServer(("127.0.0.1", port), FontServerHandler)
    print(f"ttf2stitch server on http://127.0.0.1:{port}")
    print(f"Word2Stitch: http://127.0.0.1:{port}/public/index.html")
    print(f"Inspector:   http://127.0.0.1:{port}/public/inspector.html")
    print(f"Fonts dir:   {os.path.abspath(FONTS_DIR)}/ ({len(_list_fonts())} fonts)")
    print("Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
