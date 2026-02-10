"""Tests for the extraction pipeline."""

import json

from tests.conftest import REFERENCE_JSON, skip_no_ttf
from ttf2stitch.extractor import ExtractionResult, extract_font


class TestExtractionResult:
    def test_has_expected_attributes(self):
        """ExtractionResult should expose font, cell_units, confidence, skipped_chars."""
        from ttf2stitch.schema import FontV2, GlyphV2

        font = FontV2(
            id="test",
            name="Test",
            height=1,
            letter_spacing=1,
            space_width=3,
            source="t",
            license="MIT",
            charset="basic",
            category="sans-serif",
            tags=["test"],
            glyphs={"A": GlyphV2(width=1, bitmap=["1"])},
        )
        result = ExtractionResult(font=font, cell_units=57, confidence=0.95, skipped_chars=["~"])
        assert result.font is font
        assert result.cell_units == 57
        assert result.confidence == 0.95
        assert result.skipped_chars == ["~"]


@skip_no_ttf
class TestExtractFont:
    def test_produces_correct_glyph_count(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True, charset="basic")
        # ACSF Brave should produce a reasonable number of basic charset glyphs
        assert len(result.font.glyphs) >= 30

    def test_correct_height(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        # Max height across all glyphs should be positive
        assert result.font.height >= 1

    def test_correct_cell_units(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        assert result.cell_units == 57
        assert result.confidence == 1.0

    def test_match_reference_glyph_a(self, acsf_brave_ttf_path):
        """Extracted 'A' glyph should match the reference JSON."""
        ref_data = json.loads(REFERENCE_JSON.read_text(encoding="utf-8"))
        ref_a = ref_data["glyphs"]["A"]

        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        extracted_a = result.font.glyphs.get("A")

        assert extracted_a is not None, "Glyph 'A' missing from extraction"
        assert extracted_a.width == ref_a["width"]
        assert extracted_a.bitmap == ref_a["bitmap"]

    def test_cursive_sets_letter_spacing_zero(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        assert result.font.letter_spacing == 0

    def test_cursive_sets_category_script(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        assert result.font.category == "script"

    def test_extraction_result_is_valid_fontv2(self, acsf_brave_ttf_path):
        result = extract_font(acsf_brave_ttf_path, is_cursive=True)
        # The font should be serializable to the v2 JSON format
        data = result.font.model_dump_json_v2()
        assert data["version"] == 2
        assert isinstance(data["glyphs"], dict)

    def test_override_name_and_id(self, acsf_brave_ttf_path):
        result = extract_font(
            acsf_brave_ttf_path,
            name="Custom Name",
            font_id="custom-id",
            is_cursive=True,
        )
        assert result.font.name == "Custom Name"
        assert result.font.id == "custom-id"
