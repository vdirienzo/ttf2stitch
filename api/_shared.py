"""Shared utilities for Word2Stitch API endpoints.

Extracted to eliminate duplication across activate, verify, check, checkout.
Prefixed with _ so Vercel does NOT expose it as a route.
"""

import json
import os
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LS_API_BASE = "https://api.lemonsqueezy.com"
LS_LICENSE_URL = f"{LS_API_BASE}/v1/licenses"

VARIANT_PLANS = {
    "1303798": "single",
    "1303800": "pack10",
    "1303802": "annual",
}

ALLOWED_ORIGINS = {"https://word2stitch.vercel.app"}
if os.environ.get("VERCEL_ENV") != "production":
    ALLOWED_ORIGINS.add("http://localhost:8042")


def cors_headers(origin):
    """Return CORS headers if origin is allowed, empty dict otherwise."""
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    return {}


def ls_license_post(action, data):
    """POST form-encoded data to LS License API (public, no auth)."""
    body = urlencode(data).encode()
    req = Request(f"{LS_LICENSE_URL}/{action}", data=body, method="POST")
    req.add_header("Accept", "application/json")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def ls_api_get(path):
    """GET from LS API (requires API key)."""
    api_key = os.environ.get("LEMONSQUEEZY_API_KEY", "")
    req = Request(f"{LS_API_BASE}{path}", method="GET")
    req.add_header("Accept", "application/vnd.api+json")
    req.add_header("Authorization", f"Bearer {api_key}")
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def mask_email(email):
    """Mask email for display: 'john@example.com' → 'j***@example.com'."""
    if not email or "@" not in email:
        return ""
    local, domain = email.rsplit("@", 1)
    masked = local[0] + "***" if len(local) > 1 else "***"
    return f"{masked}@{domain}"


def mask_key(key):
    """Mask license key for display: 'abcdef...uvwxyz' → 'abcd...wxyz'."""
    if not key or len(key) < 8:
        return "****"
    return key[:4] + "..." + key[-4:]


def json_response(handler, status, data, extra_headers=None):
    """Send a JSON response with status code and optional headers."""
    body = json.dumps(data).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    for k, v in (extra_headers or {}).items():
        handler.send_header(k, v)
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler, max_size=4096):
    """Read and parse JSON body from request. Returns (dict, error_string)."""
    length = int(handler.headers.get("Content-Length", 0))
    if length > max_size or length < 0:
        return None, "payload_too_large"
    try:
        body = json.loads(handler.rfile.read(length)) if length else {}
        return body, None
    except (json.JSONDecodeError, ValueError):
        return None, "invalid_body"


# --- Rate Limiter (in-memory, resets on cold start) ---

_rate_limits = {}  # {f"{ip}:{endpoint}": [timestamp, ...]}
_CLEANUP_INTERVAL = 300  # purge stale entries every 5 minutes
_last_cleanup = 0.0


def _cleanup_stale_entries(now, max_window):
    """Remove entries older than max_window to prevent unbounded growth."""
    global _last_cleanup
    if now - _last_cleanup < _CLEANUP_INTERVAL:
        return
    _last_cleanup = now
    stale_keys = [
        k
        for k, timestamps in _rate_limits.items()
        if not timestamps or now - timestamps[-1] > max_window
    ]
    for k in stale_keys:
        del _rate_limits[k]


def check_rate_limit(ip, endpoint, max_requests=10, window_seconds=60):
    """Check if request is within rate limit. Returns True if allowed."""
    key = f"{ip}:{endpoint}"
    now = time.time()
    _cleanup_stale_entries(now, window_seconds * 2)
    timestamps = _rate_limits.get(key, [])
    timestamps = [t for t in timestamps if now - t < window_seconds]
    if len(timestamps) >= max_requests:
        return False
    timestamps.append(now)
    _rate_limits[key] = timestamps
    return True
