"""Pipeline orchestrator: TTF font -> bitmap JSON v2.

Ties together cell detection, rendering, and sampling into a single
extraction pipeline. This is the main entry point for font conversion.
"""

import logging

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

from ttf2stitch.cell_detector import detect_cell_units
from ttf2stitch.config import (
    DEFAULT_EXCLUDE_CHARS,
    DEFAULT_FILL_THRESHOLD,
    DEFAULT_RENDER_SIZE,
    DEFAULT_SAMPLE_PCT,
)
from ttf2stitch.filters import filter_glyphs
from ttf2stitch.renderer import render_glyph
from ttf2stitch.sampler import sample_bitmap
from ttf2stitch.schema import GlyphV2, build_font_v2
from ttf2stitch.utils import FontConversionOptions, resolve_font_metadata

logger = logging.getLogger(__name__)


class ExtractionResult:
    """Result of extracting a font."""

    def __init__(
        self,
        font,
        cell_units: int,
        confidence: float,
        skipped_chars: list[str],
    ):
        self.font = font
        self.cell_units = cell_units
        self.confidence = confidence
        self.skipped_chars = skipped_chars


def extract_font(
    font_path: str,
    *,
    opts: FontConversionOptions | None = None,
    cell_units: int | None = None,
    render_size: int = DEFAULT_RENDER_SIZE,
    sample_pct: float = DEFAULT_SAMPLE_PCT,
    fill_threshold: float = DEFAULT_FILL_THRESHOLD,
    preview: bool = False,
    validate: bool = False,
) -> ExtractionResult:
    """Main extraction pipeline.

    Args:
        font_path: Path to TTF/OTF file.
        opts: Shared conversion options (metadata, charset, spacing, etc.).
        cell_units: Override CELL_UNITS detection.
        render_size: PIL render height in pixels.
        sample_pct: Center sampling percentage.
        fill_threshold: Minimum fill ratio for a cell to be considered filled.
        preview: Unused here, kept for CLI pass-through compatibility.
        validate: Unused here, kept for CLI pass-through compatibility.

    Steps:
    1. Detect/use CELL_UNITS
    2. Read font cmap, filter characters by charset
    3. For each character:
       a. Get glyph bounds from fontTools -> compute grid dimensions
       b. Render with PIL at high resolution
       c. Sample center of each cell
       d. Trim empty borders
    4. Compute max height across all glyphs
    5. Assemble FontV2 output
    """
    if opts is None:
        opts = FontConversionOptions()

    # Step 1: Cell units
    units, confidence = detect_cell_units(font_path, cell_units)
    if opts.verbose:
        logger.info("CELL_UNITS: %d (confidence: %.2f)", units, confidence)

    # Metadata inference + cursive logic
    meta = resolve_font_metadata(font_path, opts)

    # Step 2: Get cmap and filter characters
    exclude = opts.exclude_chars if opts.exclude_chars is not None else DEFAULT_EXCLUDE_CHARS
    font_obj = TTFont(font_path, fontNumber=0)
    try:
        cmap = font_obj.getBestCmap()
        glyphset = font_obj.getGlyphSet()

        filtered = filter_glyphs(cmap, opts.charset, exclude)

        glyphs: dict[str, GlyphV2] = {}
        skipped: list[str] = []

        for codepoint, char in filtered:
            glyph_name = cmap[codepoint]

            # Get bounds via BoundsPen for exact font-unit dimensions
            pen = BoundsPen(glyphset)
            glyphset[glyph_name].draw(pen)
            bounds = pen.bounds

            if bounds is None:
                if char == " ":
                    glyphs[char] = GlyphV2(
                        width=opts.space_width,
                        bitmap=["0" * opts.space_width] * 4,
                    )
                else:
                    skipped.append(char)
                continue

            x_min, y_min, x_max, y_max = bounds
            glyph_w = x_max - x_min
            glyph_h = y_max - y_min

            num_cols = max(1, round(glyph_w / units))
            num_rows = max(1, round(glyph_h / units))

            if opts.verbose:
                logger.info(
                    "  '%s': %dx%d cells (%.0fx%.0f units)",
                    char,
                    num_cols,
                    num_rows,
                    glyph_w,
                    glyph_h,
                )

            # Step 3: Render and sample
            img, img_bbox = render_glyph(font_path, char, render_size)

            if img_bbox is None:
                skipped.append(char)
                continue

            bitmap = sample_bitmap(img, img_bbox, num_rows, num_cols, sample_pct, fill_threshold)

            # Don't trim: fontTools grid dimensions are authoritative.
            # The reference format preserves empty rows/cols for baseline alignment.
            if not bitmap or not bitmap[0]:
                skipped.append(char)
                continue

            glyphs[char] = GlyphV2(width=num_cols, bitmap=bitmap)

    finally:
        font_obj.close()

    # Step 4: Compute max height
    max_height = max((len(g.bitmap) for g in glyphs.values()), default=1)

    # Step 5: Assemble FontV2
    font_v2 = build_font_v2(
        glyphs=glyphs,
        height=max_height,
        meta=meta,
        charset=opts.charset,
        space_width=opts.space_width,
    )

    return ExtractionResult(
        font=font_v2,
        cell_units=units,
        confidence=confidence,
        skipped_chars=skipped,
    )
