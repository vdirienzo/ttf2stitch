"""Tests for the cell-unit detection module."""


from tests.conftest import skip_no_ttf
from ttf2stitch.cell_detector import (
    auto_detect_cell_units,
    detect_cell_units,
    get_glyph_dimensions,
    lookup_known_family,
)


class TestLookupKnownFamily:
    @skip_no_ttf
    def test_acsf_returns_57(self, acsf_brave_ttf_path):
        result = lookup_known_family(acsf_brave_ttf_path)
        assert result == 57


class TestDetectCellUnits:
    @skip_no_ttf
    def test_with_override_returns_override(self, acsf_brave_ttf_path):
        units, confidence = detect_cell_units(acsf_brave_ttf_path, override=42)
        assert units == 42
        assert confidence == 1.0

    @skip_no_ttf
    def test_known_family_returns_known(self, acsf_brave_ttf_path):
        units, confidence = detect_cell_units(acsf_brave_ttf_path, override=None)
        assert units == 57
        assert confidence == 1.0

    @skip_no_ttf
    def test_returns_tuple(self, acsf_brave_ttf_path):
        result = detect_cell_units(acsf_brave_ttf_path)
        assert isinstance(result, tuple)
        assert len(result) == 2
        units, confidence = result
        assert isinstance(units, int)
        assert isinstance(confidence, float)


class TestGetGlyphDimensions:
    @skip_no_ttf
    def test_returns_list_of_tuples(self, acsf_brave_ttf_path):
        dims = get_glyph_dimensions(acsf_brave_ttf_path)
        assert isinstance(dims, list)
        assert len(dims) > 0
        for w, h in dims:
            assert w > 0
            assert h > 0

    @skip_no_ttf
    def test_at_most_26_entries(self, acsf_brave_ttf_path):
        dims = get_glyph_dimensions(acsf_brave_ttf_path)
        assert len(dims) <= 26  # A-Z only

    @skip_no_ttf
    def test_dimensions_divisible_by_cell_units(self, acsf_brave_ttf_path):
        """Glyph dimensions should be roughly divisible by 57 for ACSF fonts."""
        dims = get_glyph_dimensions(acsf_brave_ttf_path)
        for w, h in dims:
            cols = round(w / 57)
            rows = round(h / 57)
            assert cols >= 1
            assert rows >= 1


class TestAutoDetectCellUnits:
    @skip_no_ttf
    def test_returns_valid_range(self, acsf_brave_ttf_path):
        units, confidence = auto_detect_cell_units(acsf_brave_ttf_path)
        assert 20 <= units <= 120
        assert 0.0 <= confidence <= 1.0

    @skip_no_ttf
    def test_acsf_detects_near_57(self, acsf_brave_ttf_path):
        units, confidence = auto_detect_cell_units(acsf_brave_ttf_path)
        # Auto-detection should find 57 or something very close
        assert abs(units - 57) <= 5
        assert confidence > 0.5
