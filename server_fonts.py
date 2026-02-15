"""Font classification and listing utilities.

Classifies fonts using OS/2 table data (Panose, sFamilyClass) with
name-based heuristic fallbacks.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fontTools.ttLib import TTFont

logger = logging.getLogger("ttf2stitch.server")

FONT_EXTENSIONS = {".ttf", ".otf"}

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
