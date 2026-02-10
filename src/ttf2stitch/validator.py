"""Output quality validation for font JSON v2 files."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ttf2stitch.config import VALID_CATEGORIES

REQUIRED_FIELDS = ("version", "id", "name", "height", "glyphs", "letterSpacing", "spaceWidth")
ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def validate_font(data: dict[str, Any]) -> list[str]:
    """Run all validation checks on a font dict. Returns list of issues (empty = valid)."""
    issues: list[str] = []

    _check_schema(data, issues)
    _check_version(data, issues)
    _check_id_format(data, issues)
    _check_category(data, issues)
    _check_glyphs_nonempty(data, issues)
    _check_bitmap_consistency(data, issues)
    _check_height_consistency(data, issues)
    _check_charset_coverage(data, issues)

    return issues


def validate_file(path: str) -> list[str]:
    """Load JSON from file path, then validate."""
    filepath = Path(path)

    if not filepath.exists():
        return [f"File not found: {path}"]

    try:
        raw = filepath.read_text(encoding="utf-8")
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        return [f"Invalid JSON: {e}"]

    if not isinstance(data, dict):
        return ["Root element must be a JSON object"]

    return validate_font(data)


# --- Individual checks ---


def _check_schema(data: dict[str, Any], issues: list[str]) -> None:
    """Check required fields are present."""
    for field in REQUIRED_FIELDS:
        if field not in data:
            issues.append(f"Missing required field: '{field}'")


def _check_version(data: dict[str, Any], issues: list[str]) -> None:
    """Version must be 2."""
    version = data.get("version")
    if version is not None and version != 2:
        issues.append(f"Version must be 2, got {version}")


def _check_id_format(data: dict[str, Any], issues: list[str]) -> None:
    """ID must be lowercase alphanumeric with hyphens only."""
    font_id = data.get("id")
    if font_id is not None and not ID_PATTERN.match(str(font_id)):
        issues.append(
            f"Invalid id format: '{font_id}' (must be lowercase alphanumeric with hyphens)"
        )


def _check_category(data: dict[str, Any], issues: list[str]) -> None:
    """Category must be one of the valid categories."""
    category = data.get("category")
    if category is not None and category not in VALID_CATEGORIES:
        valid = ", ".join(sorted(VALID_CATEGORIES))
        issues.append(f"Invalid category: '{category}' (must be one of: {valid})")


def _check_glyphs_nonempty(data: dict[str, Any], issues: list[str]) -> None:
    """At least one glyph must be present."""
    glyphs = data.get("glyphs")
    if isinstance(glyphs, dict) and len(glyphs) == 0:
        issues.append("Font must contain at least 1 glyph")


def _check_bitmap_consistency(data: dict[str, Any], issues: list[str]) -> None:
    """Every glyph's bitmap row length must equal its declared width."""
    glyphs = data.get("glyphs")
    if not isinstance(glyphs, dict):
        return

    for char, glyph in glyphs.items():
        if not isinstance(glyph, dict):
            issues.append(f"Glyph '{char}': must be an object")
            continue

        width = glyph.get("width")
        bitmap = glyph.get("bitmap")

        if not isinstance(bitmap, list) or not isinstance(width, int):
            continue

        for i, row in enumerate(bitmap):
            if len(row) != width:
                issues.append(
                    f"Glyph '{char}' row {i}: length {len(row)} != declared width {width}"
                )


def _check_height_consistency(data: dict[str, Any], issues: list[str]) -> None:
    """Warn if >30% of glyphs differ from stated height by more than 50%."""
    declared_height = data.get("height")
    glyphs = data.get("glyphs")

    if not isinstance(declared_height, int) or not isinstance(glyphs, dict) or len(glyphs) == 0:
        return

    threshold = declared_height * 0.5
    outlier_count = 0

    for glyph in glyphs.values():
        if not isinstance(glyph, dict):
            continue
        bitmap = glyph.get("bitmap")
        if not isinstance(bitmap, list):
            continue
        if abs(len(bitmap) - declared_height) > threshold:
            outlier_count += 1

    total = len(glyphs)
    if total > 0 and outlier_count / total > 0.3:
        pct = round(outlier_count / total * 100)
        issues.append(
            f"Height inconsistency: {outlier_count}/{total} ({pct}%) glyphs "
            f"differ from declared height {declared_height} by >50%"
        )


def _check_charset_coverage(data: dict[str, Any], issues: list[str]) -> None:
    """If charset is 'basic', check coverage of A-Z, a-z, 0-9."""
    charset = data.get("charset")
    glyphs = data.get("glyphs")

    if charset != "basic" or not isinstance(glyphs, dict):
        return

    glyph_chars = set(glyphs.keys())

    uppercase = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lowercase = set("abcdefghijklmnopqrstuvwxyz")
    digits = set("0123456789")

    missing_upper = uppercase - glyph_chars
    missing_lower = lowercase - glyph_chars
    missing_digits = digits - glyph_chars

    if missing_upper:
        issues.append(f"Basic charset missing uppercase: {_format_chars(missing_upper)}")
    if missing_lower:
        issues.append(f"Basic charset missing lowercase: {_format_chars(missing_lower)}")
    if missing_digits:
        issues.append(f"Basic charset missing digits: {_format_chars(missing_digits)}")


def _format_chars(chars: set[str]) -> str:
    """Format a set of characters for display."""
    return ", ".join(sorted(chars))
