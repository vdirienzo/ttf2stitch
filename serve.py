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

from fontTools.ttLib import TTFont

from ttf2stitch.rasterizer import rasterize_font

OUTPUT_DIR = "output"
FONTS_DIR = "fonts"
MAX_BODY_SIZE = 2 * 1024 * 1024  # 2MB max
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$")
FONT_EXTENSIONS = {".ttf", ".otf"}

# In-memory cache: (font_file, height, bold, strategy) → font JSON dict
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}

# In-memory cache: font_path → category string
_font_categories: dict[str, str] = {}


def _classify_font(font_path: str) -> str:
    """Classify a font into a category using OS/2 table + name heuristics."""
    name_lower = Path(font_path).stem.lower()

    # Name-based heuristics (high confidence keywords)
    if any(kw in name_lower for kw in ("script", "brush", "hand", "cursive", "callig")):
        return "script"
    if any(kw in name_lower for kw in ("mono", "code", "terminal", "console", "courier")):
        return "monospace"
    if any(kw in name_lower for kw in ("pixel", "8bit", "8-bit", "bitmap", "retro")):
        return "monospace"
    if any(
        kw in name_lower
        for kw in (
            "decorat",
            "ornament",
            "fancy",
            "display",
            "grunge",
            "stencil",
            "tattoo",
            "gothic",
            "medieval",
            "western",
            "comic",
        )
    ):
        return "decorative"

    # Try OS/2 table classification (Panose + sFamilyClass)
    try:
        font = TTFont(font_path, fontNumber=0)
        os2 = font.get("OS/2")
        if os2:
            # Panose classification (more reliable than sFamilyClass)
            panose = getattr(os2, "panose", None)
            if panose:
                ft = panose.bFamilyType
                if ft == 3:  # Latin Hand Written
                    font.close()
                    return "script"
                if ft == 4:  # Latin Decoratives
                    font.close()
                    return "decorative"
                if ft == 5:  # Latin Symbol
                    font.close()
                    return "decorative"
                if ft == 2:  # Latin Text — use bSerifStyle to distinguish
                    serif_style = panose.bSerifStyle
                    font.close()
                    if serif_style >= 11:  # 11-15 = sans-serif variants
                        return "sans-serif"
                    if 2 <= serif_style <= 10:  # 2-10 = serif variants
                        return "serif"
                    return "sans-serif"  # 0/1 = any/no-fit, default sans

            # Fallback to sFamilyClass
            family_class = getattr(os2, "sFamilyClass", 0)
            high_byte = (family_class >> 8) & 0xFF
            font.close()
            class_map = {
                1: "serif",
                2: "serif",
                3: "serif",
                4: "serif",
                5: "serif",
                7: "serif",
                8: "sans-serif",
                9: "decorative",
                10: "script",
            }
            result = class_map.get(high_byte)
            if result:
                return result
        else:
            font.close()
    except Exception:
        pass

    # Additional name heuristics for sans/serif
    if "sans" in name_lower or "grotesk" in name_lower or "helvetic" in name_lower:
        return "sans-serif"
    if any(kw in name_lower for kw in ("serif", "roman", "times", "garamond")):
        return "serif"

    return "other"


def _get_category(font_path: str) -> str:
    """Get font category, using cache to avoid re-reading font files."""
    if font_path not in _font_categories:
        _font_categories[font_path] = _classify_font(font_path)
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


def _do_rasterize(font_file: str, height: int, bold: int, strategy: str) -> dict:
    """Rasterize a font, returning cached result if available."""
    cache_key = (font_file, height, bold, strategy)
    if cache_key in _rasterize_cache:
        return _rasterize_cache[cache_key]

    font_path = os.path.join(FONTS_DIR, font_file)
    if not os.path.isfile(font_path):
        raise FileNotFoundError(f"Font not found: {font_file}")

    # Validate extension
    ext = os.path.splitext(font_file)[1].lower()
    if ext not in FONT_EXTENSIONS:
        raise ValueError(f"Invalid font extension: {ext}")

    result = rasterize_font(
        font_path,
        target_height=height,
        bold=bold,
        strategy=strategy,
    )

    font_json = result.font.model_dump_json_v2()
    _rasterize_cache[cache_key] = font_json
    return font_json


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
        self._json_response(200, fonts)

    def _handle_rasterize(self):
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

        # Extract and validate parameters
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
            t0 = time.monotonic()
            font_json = _do_rasterize(font_file, height, bold, strategy)
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
            self._json_response(200, font_json)
        except FileNotFoundError as e:
            self._json_error(404, str(e))
        except Exception as e:
            self._json_error(500, f"Rasterization failed: {e}")

    def _handle_save(self):
        # Read body
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

        # Validate required fields
        font_id = body.get("id", "")
        if not font_id or not SAFE_ID_RE.match(font_id):
            self._json_error(400, f"Invalid font id: '{font_id}'")
            return

        if body.get("version") != 2:
            self._json_error(400, "version must be 2")
            return

        if not isinstance(body.get("glyphs"), dict):
            self._json_error(400, "glyphs must be an object")
            return

        # Write file
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        filepath = os.path.join(OUTPUT_DIR, f"{font_id}.json")

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
        except OSError as e:
            self._json_error(500, f"Write failed: {e}")
            return

        # Regenerate manifest
        self._regenerate_manifest()

        self._json_response(200, {"ok": True, "path": filepath})
        self.log_message("Saved font: %s (%d glyphs)", font_id, len(body["glyphs"]))

    def _handle_manifest(self):
        self._regenerate_manifest()
        self._json_response(200, {"ok": True})

    def _regenerate_manifest(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        files = sorted(
            f for f in os.listdir(OUTPUT_DIR) if f.endswith(".json") and f != "_manifest.json"
        )
        manifest_path = os.path.join(OUTPUT_DIR, "_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(files, f)

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
