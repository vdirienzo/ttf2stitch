"""Tests for the output quality validator."""

import os
from pathlib import Path

from ttf2stitch.validator import validate_file, validate_font

REFERENCE_JSON = Path(__file__).parent / "fixtures" / "acsf-brave-reference.json"


class TestValidateFont:
    def _valid_font(self, **overrides):
        data = {
            "version": 2,
            "id": "test-font",
            "name": "Test Font",
            "height": 3,
            "letterSpacing": 1,
            "spaceWidth": 3,
            "source": "Test",
            "license": "MIT",
            "charset": "basic",
            "category": "sans-serif",
            "tags": ["test"],
            "glyphs": {
                c: {"width": 3, "bitmap": ["010", "101", "111"]}
                for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            },
        }
        data.update(overrides)
        return data

    def test_valid_data_returns_empty_list(self):
        issues = validate_font(self._valid_font())
        assert issues == []

    def test_missing_version_field(self):
        data = self._valid_font()
        del data["version"]
        issues = validate_font(data)
        assert any("version" in i.lower() for i in issues)

    def test_missing_glyphs_field(self):
        data = self._valid_font()
        del data["glyphs"]
        issues = validate_font(data)
        assert any("glyphs" in i.lower() for i in issues)

    def test_missing_multiple_fields(self):
        data = self._valid_font()
        del data["id"]
        del data["name"]
        issues = validate_font(data)
        assert any("id" in i for i in issues)
        assert any("name" in i for i in issues)

    def test_wrong_version_number(self):
        issues = validate_font(self._valid_font(version=1))
        assert any("Version must be 2" in i for i in issues)

    def test_bad_id_format_uppercase(self):
        issues = validate_font(self._valid_font(id="BadId"))
        assert any("Invalid id format" in i for i in issues)

    def test_bad_id_format_spaces(self):
        issues = validate_font(self._valid_font(id="bad id"))
        assert any("Invalid id format" in i for i in issues)

    def test_valid_id_accepted(self):
        issues = validate_font(self._valid_font(id="good-font-123"))
        assert not any("id" in i.lower() for i in issues)

    def test_invalid_category(self):
        issues = validate_font(self._valid_font(category="monospace"))
        assert any("Invalid category" in i for i in issues)

    def test_valid_categories_accepted(self):
        for cat in ("serif", "sans-serif", "script", "pixel", "decorative", "gothic"):
            issues = validate_font(self._valid_font(category=cat))
            assert not any("category" in i.lower() for i in issues)

    def test_empty_glyphs(self):
        issues = validate_font(self._valid_font(glyphs={}))
        assert any("at least 1 glyph" in i for i in issues)

    def test_bitmap_width_mismatch(self):
        glyphs = {"A": {"width": 3, "bitmap": ["01", "101", "111"]}}
        issues = validate_font(self._valid_font(glyphs=glyphs))
        assert any("length" in i and "width" in i for i in issues)

    def test_height_inconsistency_many_outliers(self):
        # All glyphs have 1 row but declared height is 100 => >50% diff
        glyphs = {chr(c): {"width": 1, "bitmap": ["1"]} for c in range(ord("A"), ord("Z") + 1)}
        issues = validate_font(self._valid_font(height=100, glyphs=glyphs))
        assert any("Height inconsistency" in i for i in issues)

    def test_height_consistent_no_warning(self):
        glyphs = {
            chr(c): {"width": 3, "bitmap": ["010", "101", "111"]}
            for c in range(ord("A"), ord("Z") + 1)
        }
        issues = validate_font(self._valid_font(height=3, glyphs=glyphs))
        assert not any("Height inconsistency" in i for i in issues)

    def test_charset_coverage_missing_uppercase(self):
        # Only lowercase and digits
        glyphs = {c: {"width": 1, "bitmap": ["1"]} for c in "abcdefghijklmnopqrstuvwxyz0123456789"}
        issues = validate_font(self._valid_font(charset="basic", height=1, glyphs=glyphs))
        assert any("missing uppercase" in i.lower() for i in issues)


class TestValidateFile:
    def test_valid_file(self, reference_font_path):
        issues = validate_file(reference_font_path)
        # The reference file may have a height inconsistency warning (expected)
        non_height_issues = [i for i in issues if "Height inconsistency" not in i]
        assert non_height_issues == [], f"Unexpected issues: {non_height_issues}"

    def test_nonexistent_file(self):
        issues = validate_file("/nonexistent/path/font.json")
        assert any("File not found" in i for i in issues)

    def test_invalid_json(self, tmp_path):
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("{invalid json", encoding="utf-8")
        issues = validate_file(str(bad_file))
        assert any("Invalid JSON" in i for i in issues)

    def test_non_object_json(self, tmp_path):
        arr_file = tmp_path / "array.json"
        arr_file.write_text("[1, 2, 3]", encoding="utf-8")
        issues = validate_file(str(arr_file))
        assert any("Root element" in i for i in issues)

    def test_reference_file_exists(self, reference_font_path):
        assert os.path.exists(reference_font_path)
