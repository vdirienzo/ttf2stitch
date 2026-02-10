"""High-resolution glyph rendering using PIL.

Renders individual characters at large size (default 2000px) for accurate
cell-center sampling. Uses grayscale mode (black content on white background)
to avoid X-mark bleed from TrueType cross-stitch contours.
"""

from PIL import Image, ImageDraw, ImageFont

from ttf2stitch.config import DEFAULT_RENDER_SIZE


def render_glyph(
    font_path: str,
    char: str,
    render_size: int = DEFAULT_RENDER_SIZE,
) -> tuple[Image.Image, tuple[int, int, int, int] | None]:
    """Render a single character at high resolution.

    Args:
        font_path: Path to the TTF/OTF font file.
        char: Single character to render.
        render_size: Font size in pixels (larger = more accurate sampling).

    Returns:
        (image, bbox) where image is grayscale (L mode) and bbox is
        (left, top, right, bottom) of the glyph content, or None if empty.

    Uses ``draw.textbbox()`` instead of ``img.getbbox()`` because cross-stitch
    fonts render X-shaped marks that scatter faint anti-aliased pixels across
    the entire canvas, making ``getbbox()`` return the full image size.
    ``textbbox()`` returns the font-metric bounding box which is precise.
    """
    pil_font = ImageFont.truetype(font_path, size=render_size)
    # Oversized canvas to handle wide characters and negative bearings
    canvas_size = render_size * 3
    img = Image.new("L", (canvas_size, canvas_size), 255)
    draw = ImageDraw.Draw(img)
    # Draw at offset to handle negative bearings
    offset = render_size
    draw.text((offset, offset), char, font=pil_font, fill=0)

    # Use textbbox for precise glyph bounds (not getbbox which picks up stray pixels)
    bbox = draw.textbbox((offset, offset), char, font=pil_font)
    # textbbox returns (left, top, right, bottom); check for zero-area
    if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        return (img, None)
    return (img, bbox)


def crop_to_content(img: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Crop image to its content bounding box."""
    return img.crop(bbox)
