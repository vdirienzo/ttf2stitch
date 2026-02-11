"""Cell-center sampling to determine stitch fill from rendered glyphs.

The key insight: fontTools gives EXACT grid dimensions (glyph bounds / CELL_UNITS),
and PIL renders handle all TrueType winding/fill rules correctly. We only need to
sample the center of each cell to determine if it's filled or empty.
"""

from PIL import Image

from ttf2stitch.config import DEFAULT_FILL_THRESHOLD, DEFAULT_SAMPLE_PCT


def _sample_cell(
    img: Image.Image,
    cx: float,
    cy: float,
    cell_w: float,
    cell_h: float,
    half_sample: float,
    fill_threshold: float,
) -> str:
    """Sample the center region of one cell and return '1' if filled, '0' otherwise."""
    x1 = max(0, int(cx - cell_w * half_sample))
    y1 = max(0, int(cy - cell_h * half_sample))
    x2 = min(img.width, int(cx + cell_w * half_sample))
    y2 = min(img.height, int(cy + cell_h * half_sample))

    if x2 <= x1 or y2 <= y1:
        return "0"

    region = img.crop((x1, y1, x2, y2))
    pixels = list(region.tobytes())
    total = len(pixels)
    if total == 0:
        return "0"

    dark_count = sum(1 for p in pixels if p < 128)
    fill_ratio = dark_count / total
    return "1" if fill_ratio > fill_threshold else "0"


def sample_bitmap(
    img: Image.Image,
    bbox: tuple[int, int, int, int],
    num_rows: int,
    num_cols: int,
    sample_pct: float = DEFAULT_SAMPLE_PCT,
    fill_threshold: float = DEFAULT_FILL_THRESHOLD,
) -> list[str]:
    """Sample the center of each cell to build bitmap strings.

    Divides the content bounding box into a grid of num_rows x num_cols cells,
    then samples the center region (sample_pct fraction) of each cell. If the
    dark-pixel ratio exceeds fill_threshold, the cell is marked as filled ('1').

    Args:
        img: Grayscale PIL image (black content on white background).
        bbox: Content bounding box (left, top, right, bottom).
        num_rows: Number of stitch rows (from fontTools metrics).
        num_cols: Number of stitch columns (from fontTools metrics).
        sample_pct: Fraction of cell to sample (0.4 = center 40%).
        fill_threshold: Minimum dark pixel ratio to count as filled.

    Returns:
        List of bitmap strings, e.g. ["010", "101", "010"].
    """
    left, top, right, bottom = bbox
    content_w = right - left
    content_h = bottom - top

    cell_w = content_w / num_cols
    cell_h = content_h / num_rows

    half_sample = sample_pct / 2

    bitmap: list[str] = []
    for row in range(num_rows):
        row_str = ""
        for col in range(num_cols):
            cx = left + (col + 0.5) * cell_w
            cy = top + (row + 0.5) * cell_h
            row_str += _sample_cell(img, cx, cy, cell_w, cell_h, half_sample, fill_threshold)
        bitmap.append(row_str)

    return bitmap


def trim_bitmap(bitmap: list[str]) -> list[str]:
    """Remove empty rows from top/bottom and empty columns from left/right.

    This ensures glyphs have tight bounding boxes without wasted space,
    which is important for correct letter spacing in the output JSON.
    """
    if not bitmap:
        return bitmap

    while bitmap and all(c == "0" for c in bitmap[0]):
        bitmap = bitmap[1:]

    while bitmap and all(c == "0" for c in bitmap[-1]):
        bitmap = bitmap[:-1]

    if not bitmap:
        return bitmap

    width = len(bitmap[0])
    left_trim = 0
    for col in range(width):
        if all(row[col] == "0" for row in bitmap):
            left_trim += 1
        else:
            break

    right_trim = 0
    for col in range(width - 1, left_trim - 1, -1):
        if all(row[col] == "0" for row in bitmap):
            right_trim += 1
        else:
            break

    if left_trim > 0 or right_trim > 0:
        end = width - right_trim
        bitmap = [row[left_trim:end] for row in bitmap]

    return bitmap
