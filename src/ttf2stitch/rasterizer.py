"""Rasterize any TTF/OTF font to bitmap JSON v2 at a fixed stitch height.

Unlike the cross-stitch extraction pipeline (extractor.py) which detects
CELL_UNITS from fonts designed on a stitch grid, this module takes ANY font
and renders it at a target pixel height where 1 pixel = 1 stitch.

Includes morphological operations (dilate/erode) for decorative fonts with
thin strokes that would otherwise appear broken at low resolutions.

Usage:
    rasterize_font("arial.ttf", target_height=18)
    rasterize_font("chandia.otf", target_height=16, bold=1, threshold=100)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ttf2stitch.config import DEFAULT_EXCLUDE_CHARS
from ttf2stitch.filters import filter_glyphs
from ttf2stitch.sampler import trim_columns
from ttf2stitch.schema import FontV2, GlyphV2, build_font_v2
from ttf2stitch.utils import FontConversionOptions, resolve_font_metadata

logger = logging.getLogger(__name__)


@dataclass
class RasterResult:
    """Result of rasterizing a font."""

    font: FontV2
    target_height: int
    skipped_chars: list[str]
    cell_units: int = field(default=0)
    confidence: float = field(default=1.0)


def _dilate_bitmap(bitmap: list[str], radius: int = 1) -> list[str]:
    """Morphological dilation: expand filled pixels by radius.

    Each '1' pixel makes its neighbors (within radius) also '1'.
    This thickens thin strokes that would otherwise appear broken.
    """
    if not bitmap or radius <= 0:
        return bitmap

    rows = len(bitmap)
    cols = len(bitmap[0]) if bitmap else 0
    if cols == 0:
        return bitmap

    grid = [[c == "1" for c in row] for row in bitmap]
    result = [[False] * cols for _ in range(rows)]

    for y in range(rows):
        for x in range(cols):
            if grid[y][x]:
                # Fill neighborhood
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < rows and 0 <= nx < cols:
                            result[ny][nx] = True

    return ["".join("1" if cell else "0" for cell in row) for row in result]


def _auto_threshold(img: Image.Image) -> int:
    """Compute optimal binarization threshold using Otsu's method.

    Finds the threshold that minimizes intra-class variance between
    foreground and background pixels. Better than fixed 128 for fonts
    with thin strokes or heavy anti-aliasing.
    """
    hist = img.histogram()
    total = sum(hist)
    if total == 0:
        return 128

    sum_all = sum(i * hist[i] for i in range(256))
    sum_bg = 0.0
    weight_bg = 0
    max_variance = 0.0
    best_threshold = 128

    for t in range(256):
        weight_bg += hist[t]
        if weight_bg == 0:
            continue
        weight_fg = total - weight_bg
        if weight_fg == 0:
            break

        sum_bg += t * hist[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_all - sum_bg) / weight_fg

        variance = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if variance > max_variance:
            max_variance = variance
            best_threshold = t

    return best_threshold


def _compute_frame_metrics(
    font_obj: TTFont,
    pil_font: ImageFont.FreeTypeFont,
    render_size: int,
) -> tuple[float, float]:
    """Return None metrics to signal per-glyph scaling.

    Per-glyph scaling: each character is individually scaled to fill the
    target height based on its own ink bounding box.  This makes lowercase
    letters appear the same height as uppercase (every glyph fills 100%
    of the target).

    Returns (None, None) to signal _render_char_bitmap to use per-glyph mode.
    """
    return None, None


def _rasterize_max_ink(
    content: Image.Image,
    target_height: int,
    target_w: int,
    threshold: int | None,
) -> list[str]:
    """Max-ink strategy: mark '1' if darkest pixel in cell < threshold.

    Preserves thin strokes that LANCZOS averaging would destroy.
    """
    effective_threshold = threshold if threshold is not None else 200
    pixels = content.load()
    content_h, content_w = content.height, content.width
    cell_h = content_h / target_height
    cell_w = content_w / target_w

    bitmap: list[str] = []
    for row in range(target_height):
        row_str = ""
        for col in range(target_w):
            y1 = int(row * cell_h)
            y2 = min(int((row + 1) * cell_h), content_h)
            x1 = int(col * cell_w)
            x2 = min(int((col + 1) * cell_w), content_w)

            min_val = 255
            for py in range(y1, y2):
                for px in range(x1, x2):
                    val = pixels[px, py]
                    if val < min_val:
                        min_val = val
                        if min_val == 0:
                            break
                if min_val == 0:
                    break

            row_str += "1" if min_val < effective_threshold else "0"
        bitmap.append(row_str)
    return bitmap


def _rasterize_average(
    content: Image.Image,
    target_height: int,
    target_w: int,
    threshold: int | None,
    bold: int,
) -> list[str]:
    """Average strategy: LANCZOS resize then threshold (standard approach)."""
    scaled = content.resize((target_w, target_height), Image.LANCZOS)

    if bold > 0:
        scaled = scaled.filter(ImageFilter.SHARPEN)

    if threshold is None:
        threshold = _auto_threshold(scaled)

    bitmap: list[str] = []
    pixels = scaled.load()
    for y in range(target_height):
        row_str = ""
        for x in range(target_w):
            row_str += "1" if pixels[x, y] < threshold else "0"
        bitmap.append(row_str)
    return bitmap


def _render_char_bitmap(
    pil_font: ImageFont.FreeTypeFont,
    char: str,
    target_height: int,
    threshold: int | None = None,
    bold: int = 0,
    strategy: str = "average",
    frame_top_offset: float | None = None,
    frame_height: float | None = None,
) -> list[str] | None:
    """Render a single character at target_height pixels and binarize.

    Per-glyph mode (frame_height is None): each glyph is individually scaled
    to fill 100% of the target height based on its own ink bounding box.
    This makes all letters (uppercase and lowercase) the same height.

    Uniform mode (frame_height provided): all glyphs share the same vertical
    frame, preserving typographic proportions.

    Returns list of bitmap strings, or None if empty.
    """
    render_h = target_height * 20
    canvas_size = render_h * 4
    img = Image.new("L", (canvas_size, canvas_size), 255)
    draw = ImageDraw.Draw(img)
    draw.text((render_h, render_h), char, font=pil_font, fill=0)

    bbox = draw.textbbox((render_h, render_h), char, font=pil_font)
    left, top, right, bottom = bbox
    content_w = right - left
    content_h = bottom - top

    if content_w <= 0 or content_h <= 0:
        return None

    if frame_height is not None:
        # Uniform frame mode: same vertical frame for all glyphs
        eff_offset = frame_top_offset if frame_top_offset is not None else 0.0
        eff_frame = frame_height
        frame_top = render_h + int(eff_offset)
        frame_bottom = render_h + int(eff_offset + eff_frame)
        content = img.crop((left, frame_top, right, frame_bottom))
        target_w = max(1, round(content_w * target_height / eff_frame))
    else:
        # Per-glyph mode: each glyph fills 100% of target height
        content = img.crop((left, top, right, bottom))
        target_w = max(1, round(content_w * target_height / content_h))

    if strategy == "max-ink":
        bitmap = _rasterize_max_ink(content, target_height, target_w, threshold)
    else:
        bitmap = _rasterize_average(content, target_height, target_w, threshold, bold)

    if bold > 0:
        bitmap = _dilate_bitmap(bitmap, bold)

    return bitmap


def _rasterize_single_char(
    pil_font: ImageFont.FreeTypeFont,
    char: str,
    target_height: int,
    threshold: int | None,
    bold: int,
    strategy: str,
    do_trim: bool,
    frame_top_offset: float | None = None,
    frame_height: float | None = None,
) -> GlyphV2 | None:
    """Rasterize one character and return a GlyphV2, or None if empty."""
    bitmap = _render_char_bitmap(
        pil_font,
        char,
        target_height,
        threshold,
        bold,
        strategy,
        frame_top_offset,
        frame_height,
    )
    if bitmap is None:
        return None

    if do_trim:
        bitmap = trim_columns(bitmap)

    if not bitmap or not bitmap[0]:
        return None

    return GlyphV2(width=len(bitmap[0]), bitmap=bitmap)


def rasterize_font(
    font_path: str,
    *,
    opts: FontConversionOptions | None = None,
    target_height: int = 18,
    threshold: int | None = 128,
    bold: int = 0,
    strategy: str = "average",
    trim: bool = True,
) -> RasterResult:
    """Rasterize any TTF/OTF font at a fixed stitch height.

    Args:
        font_path: Path to TTF/OTF file.
        opts: Shared conversion options (metadata, charset, spacing, etc.).
        target_height: Desired height in stitches.
        threshold: Pixel threshold (0-255). None = auto (Otsu's method).
        bold: Dilation radius (0=none, 1=thicken, 2=extra bold).
        strategy: Downsampling strategy ("average" or "max-ink").
        trim: Whether to trim empty border rows/columns.
    """
    if opts is None:
        opts = FontConversionOptions()

    meta = resolve_font_metadata(font_path, opts)

    render_size = target_height * 20
    pil_font = ImageFont.truetype(font_path, size=render_size)

    exclude = opts.exclude_chars if opts.exclude_chars is not None else DEFAULT_EXCLUDE_CHARS
    font_obj = TTFont(font_path, fontNumber=0)
    try:
        cmap = font_obj.getBestCmap()
        filtered = filter_glyphs(cmap, opts.charset, exclude)
        frame_top_offset, frame_height = _compute_frame_metrics(font_obj, pil_font, render_size)
    finally:
        font_obj.close()

    glyphs: dict[str, GlyphV2] = {}
    skipped: list[str] = []

    for _codepoint, char in filtered:
        if char == " ":
            glyphs[char] = GlyphV2(
                width=opts.space_width,
                bitmap=["0" * opts.space_width] * target_height,
            )
            continue

        glyph = _rasterize_single_char(
            pil_font,
            char,
            target_height,
            threshold,
            bold,
            strategy,
            trim,
            frame_top_offset,
            frame_height,
        )

        if glyph is None:
            skipped.append(char)
            continue

        if opts.verbose:
            logger.info("  '%s': %dx%d stitches", char, glyph.width, len(glyph.bitmap))

        glyphs[char] = glyph

    max_height = max((len(g.bitmap) for g in glyphs.values()), default=target_height)

    font_v2 = build_font_v2(
        glyphs=glyphs,
        height=max_height,
        meta=meta,
        charset=opts.charset,
        space_width=opts.space_width,
    )

    return RasterResult(
        font=font_v2,
        target_height=target_height,
        skipped_chars=skipped,
    )
