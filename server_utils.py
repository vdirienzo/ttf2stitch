"""HTTP helpers and request validation for serve.py and Vercel API handlers.

Lightweight module with JSON response helpers, request body parsing, and
parameter validation. Font classification/listing live in server_fonts.py;
caching/rasterization live in server_cache.py.
"""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler
from typing import Any

from ttf2stitch.config import FONT_ID_PATTERN

logger = logging.getLogger("ttf2stitch.server")

MAX_BODY_SIZE = 2 * 1024 * 1024  # 2MB

# Re-export so serve.py and api/ handlers can import from server_utils.
FONT_ID_RE = FONT_ID_PATTERN


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


def validate_rasterize_params(body: dict) -> tuple[dict | None, str | None]:
    """Validate rasterize request parameters.

    Returns (params_dict, None) on success or (None, error_message) on failure.
    The params_dict contains keys: font, height, bold, strategy.
    """
    font_file = body.get("font", "")
    if not font_file or ".." in font_file or "/" in font_file or "\\" in font_file:
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


# Re-exports for backward compatibility
from server_cache import do_rasterize, etag_for_json  # noqa: E402, F401
from server_fonts import FONT_EXTENSIONS, classify_font, list_fonts  # noqa: E402, F401
