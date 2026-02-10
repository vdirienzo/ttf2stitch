"""Tests for slug generation and metadata inference utilities."""

from tests.conftest import skip_no_ttf
from ttf2stitch.utils import generate_slug, infer_category, infer_metadata, infer_tags


class TestGenerateSlug:
    def test_basic_conversion(self):
        assert generate_slug("ACSF Brave") == "acsf-brave"

    def test_underscores_to_hyphens(self):
        assert generate_slug("My_Font  Name!") == "my-font-name"

    def test_strips_special_chars(self):
        assert generate_slug("Font@#$%") == "font"

    def test_collapses_multiple_hyphens(self):
        assert generate_slug("a---b") == "a-b"

    def test_strips_leading_trailing_hyphens(self):
        assert generate_slug("--font--") == "font"

    def test_empty_string(self):
        assert generate_slug("") == ""

    def test_all_special_chars(self):
        assert generate_slug("@#$%") == ""

    def test_numbers_preserved(self):
        assert generate_slug("Font 123 Bold") == "font-123-bold"


class TestInferCategory:
    def test_script_keyword(self):
        assert infer_category("My Script Font", {}) == "script"

    def test_cursive_keyword(self):
        assert infer_category("Cursive Style", {}) == "script"

    def test_gothic_keyword(self):
        assert infer_category("Gothic Text", {}) == "gothic"

    def test_pixel_keyword(self):
        assert infer_category("Pixel Art", {}) == "pixel"

    def test_serif_keyword(self):
        assert infer_category("Modern Serif", {}) == "serif"

    def test_sans_serif_not_matched_as_serif(self):
        # "sans-serif" contains "serif" but should not match serif check
        assert infer_category("Sans Serif Font", {}) != "serif"

    def test_default_is_sans_serif(self):
        assert infer_category("Plain Font", {}) == "sans-serif"

    def test_decorative_keyword(self):
        assert infer_category("Decorative Display", {}) == "decorative"

    def test_metadata_name_considered(self):
        assert infer_category("Unknown", {"name": "Script Style"}) == "script"


class TestInferTags:
    def test_always_includes_cross_stitch(self):
        tags = infer_tags("Simple Font", {})
        assert "cross-stitch" in tags

    def test_extracts_words_from_name(self):
        tags = infer_tags("ACSF Brave", {})
        assert "acsf" in tags
        assert "brave" in tags

    def test_skips_short_words(self):
        tags = infer_tags("A B Cd Font", {})
        # 'a', 'b', 'cd' are < 3 chars, should be skipped
        assert "a" not in tags
        assert "b" not in tags
        assert "cd" not in tags

    def test_cursive_adds_extra_tags(self):
        tags = infer_tags("Test Font", {}, is_cursive=True)
        assert "cursive" in tags
        assert "connected" in tags

    def test_non_cursive_no_extra_tags(self):
        tags = infer_tags("Test Font", {}, is_cursive=False)
        assert "cursive" not in tags
        assert "connected" not in tags


class TestInferMetadata:
    @skip_no_ttf
    def test_reads_font_name(self, acsf_brave_ttf_path):
        meta = infer_metadata(acsf_brave_ttf_path)
        assert isinstance(meta["name"], str)
        assert len(meta["name"]) > 0

    @skip_no_ttf
    def test_returns_expected_keys(self, acsf_brave_ttf_path):
        meta = infer_metadata(acsf_brave_ttf_path)
        assert "name" in meta
        assert "license" in meta
        assert "source" in meta
