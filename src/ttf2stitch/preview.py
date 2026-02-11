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


def _build_glyph_blocks(
    glyphs: dict[str, Any],
    text: str,
    space_width: int,
) -> tuple[list[list[str]], int]:
    """Build rendered row blocks for each character in text.

    Returns (blocks, max_height) where each block is a list of rendered rows.
    """
    blocks: list[list[str]] = []
    max_height = 0

    for char in text:
        if char == " ":
            block = [EMPTY * space_width]
            blocks.append(block)
            max_height = max(max_height, 1)
            continue

        glyph = glyphs.get(char)
        if glyph is None:
            block = [EMPTY]
            blocks.append(block)
            max_height = max(max_height, 1)
            continue

        bitmap = glyph.get("bitmap", [])
        width = glyph.get("width", 0)
        rendered_rows = [
            "".join(FILLED if c == "1" else EMPTY for c in row.ljust(width, "0")) for row in bitmap
        ]

        blocks.append(rendered_rows)
        max_height = max(max_height, len(rendered_rows))

    return blocks, max_height


def _join_blocks_horizontal(
    blocks: list[list[str]],
    max_height: int,
    letter_spacing: int,
) -> str:
    """Pad blocks to max_height (bottom-aligned) and join rows horizontally."""
    padded: list[list[str]] = []
    for block in blocks:
        block_width = len(block[0]) if block else 0
        empty_row = EMPTY * block_width
        top_padding = max_height - len(block)
        padded.append([empty_row] * top_padding + block)

    spacer = EMPTY * letter_spacing
    output_lines = [
        spacer.join(block[row_idx] for block in padded) for row_idx in range(max_height)
    ]
    return "\n".join(output_lines)


def preview_text(font_data: dict[str, Any], text: str) -> str:
    """Render a line of text with glyphs side by side.

    Glyphs are padded to the same height (bottom-aligned) and joined horizontally
    with letterSpacing columns of dots between them.
    """
    if not text:
        return ""

    glyphs = font_data.get("glyphs", {})
    letter_spacing = font_data.get("letterSpacing", 1)
    space_width = font_data.get("spaceWidth", 3)

    blocks, max_height = _build_glyph_blocks(glyphs, text, space_width)
    if max_height == 0:
        return ""

    return _join_blocks_horizontal(blocks, max_height, letter_spacing)
