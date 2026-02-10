"""Rasterize any TTF/OTF font to bitmap JSON v2 at a fixed stitch height.

Unlike the cross-stitch extraction pipeline (extractor.py) which detects
CELL_UNITS from fonts designed on a stitch grid, this module takes ANY font
and renders it at a target pixel height where 1 pixel = 1 stitch.

Includes morphological operations (dilate/erode) for decorative fonts with
thin strokes that would otherwise appear broken at low resolutions.

Usage:
    rasterize_font("arial.ttf", target_height=8)
    rasterize_font("chandia.otf", target_height=16, bold=1, threshold=100)
"""

import logging

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ttf2stitch.config import DEFAULT_EXCLUDE_CHARS, DEFAULT_LETTER_SPACING, DEFAULT_SPACE_WIDTH
from ttf2stitch.filters import filter_glyphs
from ttf2stitch.sampler import trim_bitmap
from ttf2stitch.schema import FontV2, GlyphV2
from ttf2stitch.utils import generate_slug, infer_category, infer_metadata, infer_tags

logger = logging.getLogger(__name__)


class RasterResult:
    """Result of rasterizing a font."""

    def __init__(
        self,
        font: FontV2,
        target_height: int,
        skipped_chars: list[str],
    ):
        self.font = font
        self.target_height = target_height
        self.skipped_chars = skipped_chars
        self.cell_units = 0
        self.confidence = 1.0


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

    # Parse to 2D grid
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


def _render_char_bitmap(
    pil_font: ImageFont.FreeTypeFont,
    char: str,
    target_height: int,
    threshold: int | None = None,
    bold: int = 0,
    strategy: str = "average",
) -> list[str] | None:
    """Render a single character at target_height pixels and binarize.

    Args:
        pil_font: PIL font loaded at oversized render resolution.
        char: Single character to render.
        target_height: Target height in pixels (1px = 1 stitch).
        threshold: Binarization threshold (0-255). None = auto (Otsu).
        bold: Dilation radius (0=none, 1=thicken thin strokes, 2=extra bold).
        strategy: Downsampling strategy:
            "average" - LANCZOS resize then threshold (good for clean fonts)
            "max-ink" - min-pool cells: if ANY pixel has ink → '1' (best for script/thin strokes)

    Returns:
        List of bitmap strings, or None if empty.
    """
    ascent, descent = pil_font.getmetrics()
    line_height = ascent + descent
    if line_height <= 0:
        return None

    # Render oversized for quality
    render_h = target_height * 20
    canvas_size = render_h * 4
    img = Image.new("L", (canvas_size, canvas_size), 255)
    draw = ImageDraw.Draw(img)
    draw.text((render_h, render_h), char, font=pil_font, fill=0)

    # Get precise bbox from font metrics
    bbox = draw.textbbox((render_h, render_h), char, font=pil_font)
    left, top, right, bottom = bbox
    content_w = right - left
    content_h = bottom - top

    if content_w <= 0 or content_h <= 0:
        return None

    # Crop content region
    content = img.crop((left, top, right, bottom))

    # Target width proportional to content
    target_w = max(1, round(content_w * target_height / content_h))

    if strategy == "max-ink":
        # Max-ink: divide high-res image into cells, mark '1' if darkest pixel < threshold
        # This preserves thin strokes that LANCZOS averaging would destroy
        effective_threshold = threshold if threshold is not None else 200
        pixels = content.load()
        cell_h = content_h / target_height
        cell_w = content_w / target_w

        bitmap: list[str] = []
        for row in range(target_height):
            row_str = ""
            for col in range(target_w):
                # Cell boundaries in high-res image
                y1 = int(row * cell_h)
                y2 = min(int((row + 1) * cell_h), content_h)
                x1 = int(col * cell_w)
                x2 = min(int((col + 1) * cell_w), content_w)

                # Find darkest pixel in cell (min value = most ink)
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
    else:
        # Average: LANCZOS resize then threshold (standard approach)
        scaled = content.resize((target_w, target_height), Image.LANCZOS)

        if bold > 0:
            scaled = scaled.filter(ImageFilter.SHARPEN)

        if threshold is None:
            threshold = _auto_threshold(scaled)

        bitmap = []
        pixels = scaled.load()
        for y in range(target_height):
            row_str = ""
            for x in range(target_w):
                row_str += "1" if pixels[x, y] < threshold else "0"
            bitmap.append(row_str)

    # Morphological dilation for bold effect
    if bold > 0:
        bitmap = _dilate_bitmap(bitmap, bold)

    return bitmap


def rasterize_font(
    font_path: str,
    *,
    target_height: int = 8,
    threshold: int | None = 128,
    bold: int = 0,
    strategy: str = "average",
    name: str | None = None,
    font_id: str | None = None,
    letter_spacing: int = DEFAULT_LETTER_SPACING,
    space_width: int = DEFAULT_SPACE_WIDTH,
    charset: str = "basic",
    category: str | None = None,
    source: str | None = None,
    license_str: str | None = None,
    tags: list[str] | None = None,
    exclude_chars: set[str] | None = None,
    is_cursive: bool = False,
    trim: bool = True,
    verbose: bool = False,
) -> RasterResult:
    """Rasterize any TTF/OTF font at a fixed stitch height.

    Args:
        font_path: Path to TTF/OTF file.
        target_height: Desired height in stitches.
        threshold: Pixel threshold (0-255). None = auto (Otsu's method).
        bold: Dilation radius (0=none, 1=thicken, 2=extra bold).
        name: Display name override.
        font_id: Font ID override.
        letter_spacing: Space between letters in stitches.
        space_width: Width of space character in stitches.
        charset: "basic" or "extended".
        category: Font category.
        source: Attribution text.
        license_str: License identifier.
        tags: Tags list.
        exclude_chars: Characters to exclude.
        is_cursive: Shorthand for spacing=0, category=script.
        trim: Whether to trim empty border rows/columns.
        verbose: Enable logging.
    """
    metadata = infer_metadata(font_path)
    display_name = name or metadata["name"] or "Unknown Font"
    slug = font_id or generate_slug(display_name)
    font_category = category or infer_category(display_name, metadata)
    font_tags = tags or infer_tags(display_name, metadata, is_cursive)
    font_source = source or metadata["source"]
    font_license = license_str or metadata["license"]

    if is_cursive:
        letter_spacing = 0
        font_category = "script"

    render_size = target_height * 20
    pil_font = ImageFont.truetype(font_path, size=render_size)

    exclude = exclude_chars if exclude_chars is not None else DEFAULT_EXCLUDE_CHARS
    font_obj = TTFont(font_path, fontNumber=0)
    try:
        cmap = font_obj.getBestCmap()
        filtered = filter_glyphs(cmap, charset, exclude)
    finally:
        font_obj.close()

    glyphs: dict[str, GlyphV2] = {}
    skipped: list[str] = []

    for _codepoint, char in filtered:
        if char == " ":
            glyphs[char] = GlyphV2(
                width=space_width,
                bitmap=["0" * space_width] * target_height,
            )
            continue

        bitmap = _render_char_bitmap(pil_font, char, target_height, threshold, bold, strategy)

        if bitmap is None:
            skipped.append(char)
            continue

        if trim:
            bitmap = trim_bitmap(bitmap)

        if not bitmap or not bitmap[0]:
            skipped.append(char)
            continue

        width = len(bitmap[0])

        if verbose:
            logger.info("  '%s': %dx%d stitches", char, width, len(bitmap))

        glyphs[char] = GlyphV2(width=width, bitmap=bitmap)

    max_height = max((len(g.bitmap) for g in glyphs.values()), default=target_height)

    font_v2 = FontV2(
        id=slug,
        name=display_name,
        height=max_height,
        letter_spacing=letter_spacing,
        space_width=space_width,
        source=font_source,
        license=font_license,
        charset=charset,
        category=font_category,
        tags=font_tags,
        glyphs=glyphs,
    )

    return RasterResult(
        font=font_v2,
        target_height=target_height,
        skipped_chars=skipped,
    )
