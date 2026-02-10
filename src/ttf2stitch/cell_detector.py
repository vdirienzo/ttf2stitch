"""Detect CELL_UNITS (font-units-per-stitch-cell) for cross-stitch TTF fonts.

CELL_UNITS is the fundamental unit size: e.g. ACSF fonts use 57 (44 stitch + 13 gap).
Detection strategy: known-family lookup > auto-detection by integer-divisibility scoring.
"""

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

from ttf2stitch.config import CELL_UNITS_MAX, CELL_UNITS_MIN, KNOWN_CELL_UNITS


def lookup_known_family(font_path: str) -> int | None:
    """Check if font belongs to a known family with known CELL_UNITS.

    Reads the font name table and checks nameID 1 (family) and 4 (full name)
    against the KNOWN_CELL_UNITS registry.
    """
    font = TTFont(font_path, fontNumber=0)
    try:
        name_table = font["name"]
        for name_id in (1, 4):
            record = name_table.getName(name_id, 3, 1, 0x0409) or name_table.getName(
                name_id, 1, 0, 0
            )
            if record:
                font_name = str(record).lower()
                for family, units in KNOWN_CELL_UNITS.items():
                    if family in font_name:
                        return units
    finally:
        font.close()
    return None


def get_glyph_dimensions(font_path: str) -> list[tuple[float, float]]:
    """Extract width and height of A-Z glyphs in font units.

    Uses BoundsPen to get exact glyph bounds for uppercase letters,
    which tend to have the most consistent cell-aligned dimensions.

    Returns:
        List of (width, height) tuples in font units.
    """
    font = TTFont(font_path, fontNumber=0)
    try:
        cmap = font.getBestCmap()
        glyphset = font.getGlyphSet()
        dimensions: list[tuple[float, float]] = []

        for code in range(ord("A"), ord("Z") + 1):
            if code not in cmap:
                continue
            glyph_name = cmap[code]
            pen = BoundsPen(glyphset)
            glyphset[glyph_name].draw(pen)
            bounds = pen.bounds
            if bounds is None:
                continue
            x_min, y_min, x_max, y_max = bounds
            w = x_max - x_min
            h = y_max - y_min
            if w > 0 and h > 0:
                dimensions.append((w, h))

        return dimensions
    finally:
        font.close()


def auto_detect_cell_units(font_path: str) -> tuple[int, float]:
    """Auto-detect CELL_UNITS by scoring candidates on integer-divisibility.

    Tries every candidate from CELL_UNITS_MIN to CELL_UNITS_MAX. For each,
    checks how many glyph dimensions divide evenly (within 15% tolerance).
    The candidate with the highest score wins.

    Returns:
        (best_cell_units, confidence) where confidence is 0.0-1.0.
    """
    dimensions = get_glyph_dimensions(font_path)
    if not dimensions:
        return (57, 0.0)  # fallback

    all_values: list[float] = []
    for w, h in dimensions:
        all_values.extend([w, h])

    best_units = 57
    best_score = 0.0

    for candidate in range(CELL_UNITS_MIN, CELL_UNITS_MAX + 1):
        score = 0
        for val in all_values:
            ratio = val / candidate
            rounded = round(ratio)
            if rounded > 0 and abs(ratio - rounded) < 0.15:
                score += 1
        normalized = score / len(all_values) if all_values else 0
        if normalized > best_score:
            best_score = normalized
            best_units = candidate

    return (best_units, best_score)


def detect_cell_units(font_path: str, override: int | None = None) -> tuple[int, float]:
    """Main entry point for cell-unit detection.

    Strategy (in order):
    1. If override provided, use it (confidence 1.0)
    2. Try known-family lookup (confidence 1.0)
    3. Fall back to auto-detection (confidence 0.0-1.0)

    Returns:
        (cell_units, confidence) tuple.
    """
    if override is not None:
        return (override, 1.0)

    known = lookup_known_family(font_path)
    if known is not None:
        return (known, 1.0)

    return auto_detect_cell_units(font_path)
