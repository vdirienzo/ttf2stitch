"""Tests for charset filtering and character exclusion."""

import pytest

from ttf2stitch.config import BASIC_CHARSET
from ttf2stitch.filters import filter_glyphs, get_charset, is_printable_char

# ---------------------------------------------------------------------------
# get_charset
# ---------------------------------------------------------------------------


class TestGetCharset:
    def test_basic_returns_correct_set(self):
        cs = get_charset("basic")
        assert cs is BASIC_CHARSET
        assert "A" in cs
        assert "z" in cs
        assert "0" in cs
        assert " " in cs

    def test_extended_includes_basic(self):
        basic = get_charset("basic")
        extended = get_charset("extended")
        assert basic.issubset(extended)

    def test_extended_has_extra_chars(self):
        extended = get_charset("extended")
        assert "@" in extended
        assert "[" in extended
        assert "\\" in extended

    def test_unknown_raises_valueerror(self):
        with pytest.raises(ValueError, match="Unknown charset"):
            get_charset("unicode")


# ---------------------------------------------------------------------------
# is_printable_char
# ---------------------------------------------------------------------------


class TestIsPrintableChar:
    def test_space_is_printable(self):
        assert is_printable_char(" ") is True

    def test_regular_letter_is_printable(self):
        assert is_printable_char("A") is True

    def test_digit_is_printable(self):
        assert is_printable_char("5") is True

    def test_null_control_char_not_printable(self):
        assert is_printable_char("\x00") is False

    def test_tab_control_char_not_printable(self):
        assert is_printable_char("\t") is False

    def test_newline_not_printable(self):
        assert is_printable_char("\n") is False

    def test_multi_char_string_returns_false(self):
        assert is_printable_char("AB") is False

    def test_empty_string_returns_false(self):
        assert is_printable_char("") is False


# ---------------------------------------------------------------------------
# filter_glyphs
# ---------------------------------------------------------------------------


class TestFilterGlyphs:
    def _make_cmap(self, chars: str) -> dict[int, str]:
        """Build a simple cmap: codepoint -> glyph name."""
        return {ord(c): f"glyph_{c}" for c in chars}

    def test_filters_by_basic_charset(self):
        cmap = self._make_cmap("A@B$C")
        result = filter_glyphs(cmap, "basic", set())
        chars = [c for _, c in result]
        assert "A" in chars
        assert "B" in chars
        assert "C" in chars
        assert "@" not in chars  # @ is extended only

    def test_extended_includes_at_sign(self):
        cmap = self._make_cmap("A@B")
        result = filter_glyphs(cmap, "extended", set())
        chars = [c for _, c in result]
        assert "@" in chars

    def test_excludes_specified_chars(self):
        cmap = self._make_cmap("ABC")
        result = filter_glyphs(cmap, "basic", {"B"})
        chars = [c for _, c in result]
        assert "B" not in chars
        assert "A" in chars

    def test_sorted_by_codepoint(self):
        cmap = self._make_cmap("CBA")
        result = filter_glyphs(cmap, "basic", set())
        codepoints = [cp for cp, _ in result]
        assert codepoints == sorted(codepoints)

    def test_empty_cmap_returns_empty(self):
        result = filter_glyphs({}, "basic", set())
        assert result == []

    def test_control_chars_excluded(self):
        cmap = {0: "null", 9: "tab", 65: "A"}
        result = filter_glyphs(cmap, "basic", set())
        chars = [c for _, c in result]
        assert "A" in chars
        assert len(chars) == 1
