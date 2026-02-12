"""Custom HTTP server for ttf2stitch with font rasterization API.

Extends SimpleHTTPRequestHandler to add:
- POST /api/save: Save a font JSON v2 file to output/<id>.json
- POST /api/manifest: Regenerate output/_manifest.json
- GET  /api/fonts: List available TTF/OTF fonts from fonts/ directory
- POST /api/rasterize: Rasterize a TTF font at a given stitch height

All other requests (GET, HEAD) are handled by the default static file server.
"""

import contextlib
import json
import logging
import os
import sys
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

from server_utils import (
    FONT_ID_RE,
    do_rasterize,
    etag_for_json,
    json_error,
    json_response,
    list_fonts,
    read_json_body,
    validate_rasterize_params,
)

logger = logging.getLogger(__name__)

OUTPUT_DIR = "output"
FONTS_DIR = "fonts"

# In-memory caches
_rasterize_cache: dict[tuple[str, int, int, str], dict] = {}
_font_categories: dict[str, str] = {}


_rasterize_semaphore = threading.Semaphore(3)


class FontServerHandler(SimpleHTTPRequestHandler):
    """HTTP handler with font save, list, and rasterization APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "public"),
            **kwargs,
        )

    def list_directory(self, path):
        self.send_error(403, "Directory listing not allowed")
        return None

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

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
        fonts = list_fonts(FONTS_DIR, category_cache=_font_categories)
        json_response(self, fonts)

    def _handle_rasterize(self):
        # Public endpoint — preview is free for everyone
        body = read_json_body(self)
        if body is None:
            return

        params, error = validate_rasterize_params(body)
        if error:
            logger.warning("Rejected rasterize request from %s: %s", self.client_address[0], error)
            json_error(self, error, 400)
            return

        if not _rasterize_semaphore.acquire(timeout=10):
            json_error(self, "Server busy, try again later", 503)
            return
        try:
            t0 = time.monotonic()
            font_json = do_rasterize(
                params["font"],
                params["height"],
                params["bold"],
                params["strategy"],
                fonts_dir=FONTS_DIR,
                cache=_rasterize_cache,
            )
            elapsed = time.monotonic() - t0
            self.log_message(
                "Rasterized: %s h=%d bold=%d %s (%.1fs, %d glyphs)",
                params["font"],
                params["height"],
                params["bold"],
                params["strategy"],
                elapsed,
                len(font_json.get("glyphs", {})),
            )
            json_response(
                self,
                font_json,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "ETag": f'"{etag_for_json(font_json)}"',
                },
            )
        except FileNotFoundError:
            json_error(self, "Font not found", 404)
        except Exception:
            logger.exception("Rasterization failed for request")
            json_error(self, "Internal server error", 500)
        finally:
            _rasterize_semaphore.release()

    def _handle_save(self):
        body = read_json_body(self)
        if body is None:
            return

        # Validate required fields
        font_id = body.get("id", "")
        if not font_id or not FONT_ID_RE.match(font_id):
            logger.warning("Rejected save request from %s: invalid font id", self.client_address[0])
            json_error(self, "Invalid font id", 400)
            return

        if body.get("version") != 2:
            logger.warning(
                "Rejected save request from %s: version must be 2", self.client_address[0]
            )
            json_error(self, "version must be 2", 400)
            return

        if not isinstance(body.get("glyphs"), dict):
            logger.warning(
                "Rejected save request from %s: glyphs must be an object", self.client_address[0]
            )
            json_error(self, "glyphs must be an object", 400)
            return

        # Write file
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        filepath = os.path.join(OUTPUT_DIR, f"{font_id}.json")

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
        except OSError:
            logger.exception("Write failed for font id=%s", font_id)
            json_error(self, "Internal server error", 500)
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
        origin = self.headers.get("Origin", "")
        allowed = {"http://localhost:8042", "http://127.0.0.1:8042"}
        if origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[serve] {fmt % args}\n")


def _warmup_cache():
    """Pre-rasterize all fonts at default height (18) in background.

    On first run, this populates the disk cache. On subsequent server
    starts, disk cache hits make this nearly instant — each font just
    reads a JSON file instead of rendering.
    """
    fonts = list_fonts(FONTS_DIR, category_cache=_font_categories)
    total = len(fonts)
    for i, font_info in enumerate(fonts):
        with contextlib.suppress(Exception):
            do_rasterize(
                font_info["file"],
                18,
                0,
                "average",
                fonts_dir=FONTS_DIR,
                cache=_rasterize_cache,
            )
        if (i + 1) % 50 == 0:
            print(f"[warmup] {i + 1}/{total} fonts pre-cached at h=18")
    print(f"[warmup] Complete: {total} fonts cached")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8042
    server = HTTPServer(("127.0.0.1", port), FontServerHandler)
    print(f"ttf2stitch server on http://127.0.0.1:{port}")
    print("Payments:    Lemon Squeezy (client-side overlay)")
    print(f"Word2Stitch: http://127.0.0.1:{port}/")
    print(f"Inspector:   http://127.0.0.1:{port}/inspector.html")
    font_count = len(list_fonts(FONTS_DIR, category_cache=_font_categories))
    print(f"Fonts dir:   {os.path.abspath(FONTS_DIR)}/ ({font_count} fonts)")
    print("Press Ctrl+C to stop\n")

    # Background warmup: pre-rasterize all fonts at default height
    threading.Thread(target=_warmup_cache, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
