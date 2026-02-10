"""Slug generation and metadata inference from font files."""

import re

from fontTools.ttLib import TTFont


def generate_slug(name: str) -> str:
    """Convert a display name to a URL-friendly slug.

    "ACSF Brave" -> "acsf-brave"
    "My_Font  Name!" -> "my-font-name"
    """
    slug = name.lower()
    # Replace spaces and underscores with hyphens
    slug = re.sub(r"[\s_]+", "-", slug)
    # Strip anything that isn't alphanumeric or hyphen
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    # Collapse multiple hyphens
    slug = re.sub(r"-{2,}", "-", slug)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    return slug


def _get_name_entry(font: TTFont, name_id: int) -> str | None:
    """Extract a string from the font's name table by nameID."""
    name_table = font["name"]
    record = name_table.getName(name_id, 3, 1, 0x0409)  # Windows, Unicode BMP, English
    if record is None:
        record = name_table.getName(name_id, 1, 0, 0)  # Mac, Roman, English
    if record is None:
        return None
    return str(record)


def infer_metadata(font_path: str) -> dict:
    """Read font name table to extract metadata.

    Returns dict with keys: name, license, source.
    """
    font = TTFont(font_path, fontNumber=0)
    try:
        # Name: prefer nameID 4 (full name), fallback to 1 (family name)
        name = _get_name_entry(font, 4) or _get_name_entry(font, 1) or ""

        # License: prefer nameID 13 (license description), fallback to 0 (copyright)
        license_str = _get_name_entry(font, 13) or _get_name_entry(font, 0) or ""

        # Source/designer: nameID 9
        source = _get_name_entry(font, 9) or ""

        return {
            "name": name.strip(),
            "license": license_str.strip(),
            "source": source.strip(),
        }
    finally:
        font.close()


def infer_category(name: str, metadata: dict) -> str:
    """Infer font category from name and metadata using simple heuristics."""
    text = f"{name} {metadata.get('name', '')}".lower()
    if any(kw in text for kw in ("script", "cursive", "italic")):
        return "script"
    if "gothic" in text:
        return "gothic"
    if any(kw in text for kw in ("pixel", "bitmap")):
        return "pixel"
    if "serif" in text and "sans" not in text:
        return "serif"
    if "decorative" in text or "ornament" in text:
        return "decorative"
    return "sans-serif"


def infer_tags(name: str, metadata: dict, is_cursive: bool = False) -> list[str]:
    """Generate tags from font name and metadata.

    Always includes "cross-stitch". Extracts meaningful words from the name.
    """
    tags: list[str] = []

    # Extract words from name (skip very short ones)
    words = re.findall(r"[a-zA-Z]+", name.lower())
    for word in words:
        if len(word) >= 3 and word not in ("the", "font", "ttf", "otf"):
            tags.append(word)

    # Always include cross-stitch
    if "cross-stitch" not in tags:
        tags.append("cross-stitch")

    # Cursive-specific tags
    if is_cursive:
        if "cursive" not in tags:
            tags.append("cursive")
        if "connected" not in tags:
            tags.append("connected")

    return tags
