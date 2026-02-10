"""ASCII art glyph preview for font JSON v2 data."""

from __future__ import annotations

from typing import Any

FILLED = "\u2588"  # █
EMPTY = "\u00b7"  # ·


def preview_glyph(glyph_data: dict[str, Any], char: str) -> str:
    """Render a single glyph as ASCII art.

    Returns a string with header line and bitmap rows using █ for filled and · for empty.
    """
    width = glyph_data.get("width", 0)
    bitmap = glyph_data.get("bitmap", [])
    height = len(bitmap)

    lines: list[str] = []
    lines.append(f"'{char}' ({width}\u00d7{height})")

    for row in bitmap:
        rendered = "".join(FILLED if c == "1" else EMPTY for c in row)
        lines.append(rendered)

    return "\n".join(lines)


def preview_font(font_data: dict[str, Any], chars: str | None = None) -> str:
    """Preview multiple glyphs vertically, separated by blank lines.

    If chars is None, show all glyphs. Otherwise show only specified chars.
    """
    glyphs = font_data.get("glyphs", {})

    char_list = list(glyphs.keys()) if chars is None else list(chars)

    sections: list[str] = []
    for char in char_list:
        if char not in glyphs:
            sections.append(f"'{char}' (not found)")
            continue
        sections.append(preview_glyph(glyphs[char], char))

    return "\n\n".join(sections)


def preview_text(font_data: dict[str, Any], text: str) -> str:
    """Render a line of text with glyphs side by side.

    Glyphs are padded to the same height (bottom-aligned) and joined horizontally
    with letterSpacing columns of dots between them.
    """
    glyphs = font_data.get("glyphs", {})
    letter_spacing = font_data.get("letterSpacing", 1)
    space_width = font_data.get("spaceWidth", 3)

    if not text:
        return ""

    # Build column blocks for each character
    blocks: list[list[str]] = []
    max_height = 0

    for char in text:
        if char == " ":
            # Space: empty columns of space_width
            block = [EMPTY * space_width]
            blocks.append(block)
            max_height = max(max_height, 1)
            continue

        glyph = glyphs.get(char)
        if glyph is None:
            # Unknown char: render as single column of dots
            block = [EMPTY]
            blocks.append(block)
            max_height = max(max_height, 1)
            continue

        bitmap = glyph.get("bitmap", [])
        rendered_rows = []
        width = glyph.get("width", 0)
        for row in bitmap:
            rendered_rows.append(
                "".join(FILLED if c == "1" else EMPTY for c in row.ljust(width, "0"))
            )

        blocks.append(rendered_rows)
        max_height = max(max_height, len(rendered_rows))

    if max_height == 0:
        return ""

    # Pad all blocks to max_height (bottom-aligned: pad top with empty rows)
    padded: list[list[str]] = []
    for block in blocks:
        block_width = len(block[0]) if block else 0
        empty_row = EMPTY * block_width
        top_padding = max_height - len(block)
        padded_block = [empty_row] * top_padding + block
        padded.append(padded_block)

    # Build spacing separator
    spacer = EMPTY * letter_spacing

    # Join rows horizontally
    output_lines: list[str] = []
    for row_idx in range(max_height):
        row_parts = [block[row_idx] for block in padded]
        output_lines.append(spacer.join(row_parts))

    return "\n".join(output_lines)
