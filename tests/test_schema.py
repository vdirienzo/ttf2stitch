"""Tests for the Pydantic v2 schema models (GlyphV2, FontV2)."""

import pytest
from pydantic import ValidationError

from ttf2stitch.schema import FontV2, GlyphV2

# ---------------------------------------------------------------------------
# GlyphV2
# ---------------------------------------------------------------------------


class TestGlyphV2:
    def test_valid_creation(self):
        g = GlyphV2(width=3, bitmap=["010", "101", "010"])
        assert g.width == 3
        assert len(g.bitmap) == 3

    def test_single_pixel_glyph(self):
        g = GlyphV2(width=1, bitmap=["1"])
        assert g.width == 1
        assert g.bitmap == ["1"]

    def test_wide_glyph(self):
        row = "1" * 50
        g = GlyphV2(width=50, bitmap=[row, row])
        assert g.width == 50
        assert len(g.bitmap) == 2

    def test_width_zero_raises(self):
        with pytest.raises(ValidationError, match="width must be >= 1"):
            GlyphV2(width=0, bitmap=["0"])

    def test_width_negative_raises(self):
        with pytest.raises(ValidationError, match="width must be >= 1"):
            GlyphV2(width=-1, bitmap=["0"])

    def test_empty_bitmap_raises(self):
        with pytest.raises(ValidationError, match="at least one row"):
            GlyphV2(width=3, bitmap=[])

    def test_bitmap_row_length_mismatch_raises(self):
        with pytest.raises(ValidationError, match="row 1 has length 2"):
            GlyphV2(width=3, bitmap=["010", "01", "010"])

    def test_bitmap_all_zeros(self):
        g = GlyphV2(width=3, bitmap=["000", "000", "000"])
        assert all(row == "000" for row in g.bitmap)

    def test_bitmap_all_ones(self):
        g = GlyphV2(width=2, bitmap=["11", "11"])
        assert g.bitmap == ["11", "11"]

    def test_single_row_glyph(self):
        g = GlyphV2(width=5, bitmap=["10101"])
        assert len(g.bitmap) == 1


# ---------------------------------------------------------------------------
# FontV2
# ---------------------------------------------------------------------------


class TestFontV2:
    def _make_font(self, **overrides):
        defaults = {
            "id": "test-font",
            "name": "Test Font",
            "height": 3,
            "letter_spacing": 1,
            "space_width": 3,
            "source": "Test",
            "license": "MIT",
            "charset": "basic",
            "category": "sans-serif",
            "tags": ["test"],
            "glyphs": {"A": GlyphV2(width=3, bitmap=["010", "101", "111"])},
        }
        defaults.update(overrides)
        return FontV2(**defaults)

    def test_valid_creation(self):
        f = self._make_font()
        assert f.id == "test-font"
        assert f.version == 2
        assert len(f.glyphs) == 1

    def test_height_zero_raises(self):
        with pytest.raises(ValidationError, match="height must be >= 1"):
            self._make_font(height=0)

    def test_height_negative_raises(self):
        with pytest.raises(ValidationError, match="height must be >= 1"):
            self._make_font(height=-5)

    def test_glyph_exceeds_height_raises(self):
        tall_glyph = GlyphV2(width=1, bitmap=["1", "1", "1", "1", "1"])
        with pytest.raises(ValidationError, match="exceeding font height"):
            self._make_font(height=3, glyphs={"A": tall_glyph})

    def test_glyph_shorter_than_height_ok(self):
        short = GlyphV2(width=1, bitmap=["1"])
        f = self._make_font(height=5, glyphs={"A": short})
        assert f.height == 5

    def test_version_must_be_2(self):
        with pytest.raises(ValidationError):
            self._make_font(version=1)

    def test_multiple_glyphs(self):
        glyphs = {
            "A": GlyphV2(width=3, bitmap=["010", "101", "111"]),
            "B": GlyphV2(width=3, bitmap=["110", "111", "110"]),
        }
        f = self._make_font(glyphs=glyphs)
        assert len(f.glyphs) == 2

    def test_model_dump_json_v2_camelcase(self):
        f = self._make_font(letter_spacing=2, space_width=4)
        data = f.model_dump_json_v2()
        assert "letterSpacing" in data
        assert "spaceWidth" in data
        assert "letter_spacing" not in data
        assert "space_width" not in data
        assert data["letterSpacing"] == 2
        assert data["spaceWidth"] == 4

    def test_model_dump_json_v2_preserves_version(self):
        f = self._make_font()
        data = f.model_dump_json_v2()
        assert data["version"] == 2

    def test_model_dump_json_v2_glyphs_structure(self):
        f = self._make_font()
        data = f.model_dump_json_v2()
        assert "A" in data["glyphs"]
        assert data["glyphs"]["A"]["width"] == 3
        assert isinstance(data["glyphs"]["A"]["bitmap"], list)
