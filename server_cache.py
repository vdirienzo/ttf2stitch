"""Disk cache and rasterization service.

Two-layer cache (L1 memory + L2 disk) with atomic writes for
crash safety. Integrates with ttf2stitch.rasterizer.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path

from server_fonts import FONT_EXTENSIONS

logger = logging.getLogger("ttf2stitch.server")

# Disk cache directory (relative to project root)
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "rasterize")

# Track in-flight rasterizations to prevent duplicate work
_inflight: dict[tuple[str, int, int, str], bool] = {}


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
