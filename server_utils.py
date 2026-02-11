"""Shared utilities for serve.py and Vercel serverless API handlers.

Consolidates duplicated logic: font classification, font listing, request
validation, rasterization with cache, JSON body reading, and HTTP JSON
response helpers.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import tempfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

from fontTools.ttLib import TTFont

from ttf2stitch.config import FONT_ID_PATTERN

logger = logging.getLogger("ttf2stitch.server")

FONT_EXTENSIONS = {".ttf", ".otf"}
MAX_BODY_SIZE = 2 * 1024 * 1024  # 2MB

# Re-export so serve.py and api/ handlers can import from server_utils.
FONT_ID_RE = FONT_ID_PATTERN

# Disk cache directory (relative to project root)
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "rasterize")

# Track in-flight rasterizations to prevent duplicate work
_inflight: dict[tuple[str, int, int, str], bool] = {}


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


def _classify_by_panose(panose) -> str | None:
    """Classify font by Panose bFamilyType."""
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
    return None


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
    except OSError:
        logger.warning("Could not open font for classification: %s", font_path)
        return "sans-serif"

    try:
        os2 = font.get("OS/2")
        if os2:
            panose = getattr(os2, "panose", None)
            if panose:
                result = _classify_by_panose(panose)
                if result:
                    return result

            family_class = getattr(os2, "sFamilyClass", 0)
            high_byte = (family_class >> 8) & 0xFF
            result = _FAMILY_CLASS_MAP.get(high_byte)
            if result:
                return result
    except (AttributeError, KeyError):
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
# Font listing
# ---------------------------------------------------------------------------


def list_fonts(fonts_dir: str, *, category_cache: dict[str, str] | None = None) -> list[dict]:
    """List available TTF/OTF fonts with classification metadata.

    Parameters
    ----------
    fonts_dir:        Path to the directory containing font files.
    category_cache:   Optional mutable dict for caching category lookups.
    """
    fonts: list[dict] = []
    fonts_path = Path(fonts_dir)
    if not fonts_path.is_dir():
        return fonts

    for entry in sorted(fonts_path.iterdir()):
        if entry.suffix.lower() in FONT_EXTENSIONS and entry.is_file():
            path_str = str(entry)
            if category_cache is not None and path_str in category_cache:
                category = category_cache[path_str]
            else:
                category = classify_font(path_str)
                if category_cache is not None:
                    category_cache[path_str] = category

            fonts.append(
                {
                    "file": entry.name,
                    "name": entry.stem,
                    "size": entry.stat().st_size,
                    "category": category,
                }
            )

    return fonts


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


def validate_rasterize_params(body: dict) -> tuple[dict | None, str | None]:
    """Validate rasterize request parameters.

    Returns (params_dict, None) on success or (None, error_message) on failure.
    The params_dict contains keys: font, height, bold, strategy.
    """
    font_file = body.get("font", "")
    if not font_file or ".." in font_file or "/" in font_file:
        return None, f"Invalid font filename: '{font_file}'"

    height = body.get("height", 12)
    if not isinstance(height, int) or height < 4 or height > 60:
        return None, "height must be an integer between 4 and 60"

    bold = body.get("bold", 0)
    if not isinstance(bold, int) or bold < 0 or bold > 3:
        return None, "bold must be 0, 1, 2, or 3"

    strategy = body.get("strategy", "average")
    if strategy not in ("average", "max-ink"):
        return None, "strategy must be 'average' or 'max-ink'"

    return {"font": font_file, "height": height, "bold": bold, "strategy": strategy}, None


# ---------------------------------------------------------------------------
# Disk cache helpers
# ---------------------------------------------------------------------------


def _disk_cache_path(font_file: str, height: int, bold: int, strategy: str) -> str:
    """Generate a deterministic cache file path for the given rasterization params."""
    key = f"{font_file}|{height}|{bold}|{strategy}"
    h = hashlib.md5(key.encode()).hexdigest()[:12]
    name = font_file.replace(".", "_")
    return os.path.join(CACHE_DIR, f"{name}_{height}_{bold}_{strategy}_{h}.json")


def _read_disk_cache(path: str) -> dict | None:
    """Read a JSON cache file, returning None on any failure."""
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _write_disk_cache(path: str, data: dict) -> None:
    """Atomically write data to a disk cache file.

    Uses write-to-temp + os.replace for crash safety (no partial files).
    Silently skips if filesystem is unavailable (e.g., Vercel serverless).
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f)
            os.replace(tmp_path, path)
        except OSError:
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)
    except OSError:
        pass  # Disk cache unavailable (e.g., Vercel serverless)


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

    Cache layers:
      L1 - In-memory dict (fastest, volatile)
      L2 - Disk JSON files in .cache/rasterize/ (survives restarts)

    Parameters
    ----------
    font_file:  Base filename (e.g. "Roboto.ttf")
    height:     Target stitch height in pixels
    bold:       Bold dilation amount (0-3)
    strategy:   "average" or "max-ink"
    fonts_dir:  Path to the fonts directory
    cache:      Mutable dict used as an in-memory L1 cache
    """
    cache_key = (font_file, height, bold, strategy)

    # L1: Memory cache (fastest)
    if cache_key in cache:
        return cache[cache_key]

    # L2: Disk cache (survives restarts)
    disk_path = _disk_cache_path(font_file, height, bold, strategy)
    disk_data = _read_disk_cache(disk_path)
    if disk_data is not None:
        cache[cache_key] = disk_data  # Promote to L1
        return disk_data

    # Guard against duplicate in-flight rasterizations
    if cache_key in _inflight:
        # Another request is already rasterizing this — wait for disk result
        # In practice with Python's GIL + single-threaded HTTP server this
        # is a thin guard; the real protection is the atomic disk write.
        pass
    _inflight[cache_key] = True

    try:
        from ttf2stitch.rasterizer import rasterize_font

        font_path = Path(fonts_dir) / font_file
        if not font_path.is_file():
            raise FileNotFoundError(f"Font not found: {font_file}")

        ext = font_path.suffix.lower()
        if ext not in FONT_EXTENSIONS:
            raise ValueError(f"Invalid font extension: {ext}")

        from ttf2stitch.utils import FontConversionOptions

        result = rasterize_font(
            str(font_path),
            opts=FontConversionOptions(),
            target_height=height,
            bold=bold,
            strategy=strategy,
        )

        font_json = result.font.model_dump_json_v2()

        # Write to both L1 and L2
        cache[cache_key] = font_json
        _write_disk_cache(disk_path, font_json)

        return font_json
    finally:
        _inflight.pop(cache_key, None)


def etag_for_json(data: dict) -> str:
    """Compute a short ETag from JSON data for HTTP caching."""
    raw = json.dumps(data, sort_keys=True).encode()
    return hashlib.md5(raw).hexdigest()[:16]


# ---------------------------------------------------------------------------
# HTTP helpers (work with any BaseHTTPRequestHandler subclass)
# ---------------------------------------------------------------------------


def json_response(
    handler: BaseHTTPRequestHandler,
    data: Any,
    status: int = 200,
    headers: dict[str, str] | None = None,
) -> None:
    """Send a JSON response with CORS headers and optional extra headers."""
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    origin = handler.headers.get("Origin", "")
    allowed_origins = {"http://localhost:8042", "http://127.0.0.1:8042"}
    if origin in allowed_origins:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")
    if headers:
        for k, v in headers.items():
            handler.send_header(k, v)
    handler.end_headers()
    handler.wfile.write(body)


def json_error(handler: BaseHTTPRequestHandler, message: str, status: int = 400) -> None:
    """Send a JSON error response."""
    json_response(handler, {"error": message}, status)


def read_json_body(handler: BaseHTTPRequestHandler, max_size: int = MAX_BODY_SIZE) -> dict | None:
    """Read and parse a JSON body from an HTTP request handler.

    Returns the parsed dict on success, or None if an error response was
    already sent to the client.
    """
    length = int(handler.headers.get("Content-Length", 0))
    if length > max_size:
        logger.warning(
            "Rejected request from %s: payload too large (%d bytes)",
            handler.client_address[0],
            length,
        )
        json_error(handler, "Payload too large", 413)
        return None
    if length == 0:
        logger.warning("Rejected request from %s: empty body", handler.client_address[0])
        json_error(handler, "Empty body", 400)
        return None

    try:
        return json.loads(handler.rfile.read(length))
    except json.JSONDecodeError:
        logger.warning("Rejected request from %s: invalid JSON body", handler.client_address[0])
        json_error(handler, "Invalid JSON", 400)
        return None
