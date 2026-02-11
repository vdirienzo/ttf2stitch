"""Shared utilities for serve.py and Vercel serverless API handlers.

Consolidates duplicated logic: font classification, rasterization with cache,
JSON body reading, and HTTP JSON response helpers.
"""

import json
import logging
from pathlib import Path

from fontTools.ttLib import TTFont

logger = logging.getLogger("ttf2stitch.server")

FONT_EXTENSIONS = {".ttf", ".otf"}
MAX_BODY_SIZE = 2 * 1024 * 1024  # 2MB


# ---------------------------------------------------------------------------
# Font classification
# ---------------------------------------------------------------------------

# Name-based keyword groups (checked before opening the font file)
_SCRIPT_KEYWORDS = ("script", "brush", "hand", "cursive", "callig")
_MONO_KEYWORDS = ("mono", "code", "terminal", "console", "courier")
_PIXEL_KEYWORDS = ("pixel", "8bit", "8-bit", "bitmap", "retro")
_DECORATIVE_KEYWORDS = (
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

_FAMILY_CLASS_MAP = {
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


def classify_font(font_path: str) -> str:
    """Classify a font into a category using OS/2 table + name heuristics.

    Uses try/finally to guarantee the TTFont handle is closed even if an
    exception occurs during classification.
    """
    name_lower = Path(font_path).stem.lower()

    # Fast name-based heuristics (no I/O needed)
    if any(kw in name_lower for kw in _SCRIPT_KEYWORDS):
        return "script"
    if any(kw in name_lower for kw in _MONO_KEYWORDS):
        return "monospace"
    if any(kw in name_lower for kw in _PIXEL_KEYWORDS):
        return "monospace"
    if any(kw in name_lower for kw in _DECORATIVE_KEYWORDS):
        return "decorative"

    # Try OS/2 table classification (Panose + sFamilyClass)
    try:
        font = TTFont(str(font_path), fontNumber=0)
    except Exception:
        logger.warning("Could not open font for classification: %s", font_path)
        return "sans-serif"

    try:
        os2 = font.get("OS/2")
        if os2:
            panose = getattr(os2, "panose", None)
            if panose:
                ft = panose.bFamilyType
                if ft == 3:  # Latin Hand Written
                    return "script"
                if ft in (4, 5):  # Latin Decoratives / Latin Symbol
                    return "decorative"
                if ft == 2:  # Latin Text -- use bSerifStyle to distinguish
                    serif_style = panose.bSerifStyle
                    if serif_style >= 11:  # 11-15 = sans-serif variants
                        return "sans-serif"
                    if 2 <= serif_style <= 10:  # 2-10 = serif variants
                        return "serif"
                    return "sans-serif"  # 0/1 = any/no-fit

            family_class = getattr(os2, "sFamilyClass", 0)
            high_byte = (family_class >> 8) & 0xFF
            result = _FAMILY_CLASS_MAP.get(high_byte)
            if result:
                return result
    except Exception:
        logger.warning("Error reading OS/2 table from: %s", font_path, exc_info=True)
    finally:
        font.close()

    # Fallback name heuristics for sans/serif
    if "sans" in name_lower or "grotesk" in name_lower or "helvetic" in name_lower:
        return "sans-serif"
    if any(kw in name_lower for kw in ("serif", "roman", "times", "garamond")):
        return "serif"

    return "other"


# ---------------------------------------------------------------------------
# Rasterization with cache
# ---------------------------------------------------------------------------


def do_rasterize(
    font_file: str,
    height: int,
    bold: int,
    strategy: str,
    *,
    fonts_dir: str,
    cache: dict[tuple[str, int, int, str], dict],
) -> dict:
    """Rasterize a font, returning a cached result if available.

    Parameters
    ----------
    font_file:  Base filename (e.g. "Roboto.ttf")
    height:     Target stitch height in pixels
    bold:       Bold dilation amount (0-3)
    strategy:   "average" or "max-ink"
    fonts_dir:  Path to the fonts directory
    cache:      Mutable dict used as an in-memory cache
    """
    cache_key = (font_file, height, bold, strategy)
    if cache_key in cache:
        return cache[cache_key]

    from ttf2stitch.rasterizer import rasterize_font

    font_path = Path(fonts_dir) / font_file
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
    cache[cache_key] = font_json
    return font_json


# ---------------------------------------------------------------------------
# HTTP helpers (work with any BaseHTTPRequestHandler subclass)
# ---------------------------------------------------------------------------


def json_response(handler, data, status=200):
    """Send a JSON response with CORS headers."""
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def json_error(handler, message, status=400):
    """Send a JSON error response."""
    json_response(handler, {"error": message}, status)


def read_json_body(handler, max_size=MAX_BODY_SIZE) -> dict | None:
    """Read and parse a JSON body from an HTTP request handler.

    Returns the parsed dict on success, or None if an error response was
    already sent to the client.
    """
    length = int(handler.headers.get("Content-Length", 0))
    if length > max_size:
        json_error(handler, "Payload too large", 413)
        return None
    if length == 0:
        json_error(handler, "Empty body", 400)
        return None

    try:
        return json.loads(handler.rfile.read(length))
    except json.JSONDecodeError as e:
        json_error(handler, f"Invalid JSON: {e}", 400)
        return None
