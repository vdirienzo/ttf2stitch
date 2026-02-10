"""Charset filtering and special character exclusion."""

import unicodedata

from ttf2stitch.config import BASIC_CHARSET, EXTENDED_CHARSET


def get_charset(name: str) -> set[str]:
    """Return the character set by name.

    Args:
        name: Either "basic" or "extended".

    Returns:
        The corresponding character set.

    Raises:
        ValueError: If name is not "basic" or "extended".
    """
    if name == "basic":
        return BASIC_CHARSET
    if name == "extended":
        return EXTENDED_CHARSET
    msg = f"Unknown charset '{name}', expected 'basic' or 'extended'"
    raise ValueError(msg)


def is_printable_char(char: str) -> bool:
    """Check if a character is printable and not a control character.

    Space is considered printable. Control characters (Cc category) are not.
    """
    if len(char) != 1:
        return False
    if char == " ":
        return True
    category = unicodedata.category(char)
    return category != "Cc" and char.isprintable()


def filter_glyphs(
    cmap: dict[int, str],
    charset: str,
    exclude_chars: set[str],
) -> list[tuple[int, str]]:
    """Filter cmap entries by charset and exclusions.

    Args:
        cmap: Font cmap dict mapping codepoint (int) -> glyph name (str).
        charset: Either "basic" or "extended".
        exclude_chars: Characters to exclude (e.g., special TTF chars).

    Returns:
        List of (codepoint, character) tuples sorted by codepoint,
        where each character is in the target charset, is printable,
        and is not excluded.
    """
    allowed = get_charset(charset)
    result: list[tuple[int, str]] = []

    for codepoint in cmap:
        char = chr(codepoint)
        if char in exclude_chars:
            continue
        if not is_printable_char(char):
            continue
        if char not in allowed:
            continue
        result.append((codepoint, char))

    result.sort(key=lambda x: x[0])
    return result
