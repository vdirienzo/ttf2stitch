"""Tests for the ASCII art preview module."""

from ttf2stitch.preview import EMPTY, FILLED, preview_font, preview_glyph, preview_text


class TestPreviewGlyph:
    def test_renders_filled_and_empty(self):
        glyph = {"width": 3, "bitmap": ["010", "101", "010"]}
        result = preview_glyph(glyph, "X")
        assert FILLED in result
        assert EMPTY in result

    def test_header_shows_dimensions(self):
        glyph = {"width": 5, "bitmap": ["10101", "01010"]}
        result = preview_glyph(glyph, "A")
        # Header format: 'A' (5x2) — note the multiplication sign is \u00d7
        assert "'A'" in result
        assert "5\u00d72" in result

    def test_correct_row_count(self):
        glyph = {"width": 2, "bitmap": ["10", "01", "11"]}
        result = preview_glyph(glyph, "Z")
        lines = result.strip().split("\n")
        # 1 header line + 3 bitmap rows
        assert len(lines) == 4

    def test_correct_rendering_pattern(self):
        glyph = {"width": 3, "bitmap": ["111"]}
        result = preview_glyph(glyph, "T")
        lines = result.strip().split("\n")
        assert lines[1] == FILLED * 3


class TestPreviewFont:
    def test_shows_all_glyphs(self, sample_font_data):
        result = preview_font(sample_font_data)
        assert "'A'" in result
        assert "'B'" in result
        assert "'1'" in result

    def test_filters_by_chars(self, sample_font_data):
        result = preview_font(sample_font_data, chars="A")
        assert "'A'" in result
        assert "'B'" not in result

    def test_handles_missing_char(self, sample_font_data):
        result = preview_font(sample_font_data, chars="Z")
        assert "not found" in result

    def test_sections_separated_by_blank_lines(self, sample_font_data):
        result = preview_font(sample_font_data, chars="AB")
        assert "\n\n" in result


class TestPreviewText:
    def test_horizontal_rendering(self, sample_font_data):
        result = preview_text(sample_font_data, "AB")
        lines = result.strip().split("\n")
        # All rows should exist (height = 3 rows for both glyphs)
        assert len(lines) == 3

    def test_spacing_between_chars(self, sample_font_data):
        result = preview_text(sample_font_data, "AB")
        lines = result.strip().split("\n")
        # Each line should be wider than a single glyph (3 + spacing + 3)
        for line in lines:
            assert len(line) > 3

    def test_empty_text_returns_empty(self, sample_font_data):
        result = preview_text(sample_font_data, "")
        assert result == ""

    def test_space_in_text(self, sample_font_data):
        result = preview_text(sample_font_data, "A B")
        lines = result.strip().split("\n")
        # Should render with space characters (dots)
        assert len(lines) > 0
        # Width should include space_width (3) + spacing
        for line in lines:
            assert len(line) > 6
