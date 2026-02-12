"""Tests for the rasterize pipeline (any font -> bitmap at fixed stitch height)."""

import json
import os
from pathlib import Path

import pytest
from click.testing import CliRunner

from ttf2stitch.rasterizer import RasterResult, _render_char_bitmap, rasterize_font
from ttf2stitch.schema import FontV2
from ttf2stitch.utils import FontConversionOptions

# System font for testing (DejaVu Sans is available on most Linux systems)
SYSTEM_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
HAS_SYSTEM_FONT = os.path.exists(SYSTEM_FONT)
skip_no_font = pytest.mark.skipif(not HAS_SYSTEM_FONT, reason="DejaVu Sans not found")


class TestRenderCharBitmap:
    @skip_no_font
    def test_returns_bitmap_list(self):
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=160)
        bitmap = _render_char_bitmap(font, "A", target_height=8)
        assert bitmap is not None
        assert isinstance(bitmap, list)
        assert len(bitmap) == 8

    @skip_no_font
    def test_bitmap_is_binary_strings(self):
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=160)
        bitmap = _render_char_bitmap(font, "A", target_height=8)
        assert bitmap is not None
        for row in bitmap:
            assert all(c in "01" for c in row)

    @skip_no_font
    def test_height_matches_target(self):
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=240)
        for height in (6, 8, 10, 12, 16):
            bitmap = _render_char_bitmap(font, "A", target_height=height)
            assert bitmap is not None
            assert len(bitmap) == height

    @skip_no_font
    def test_has_filled_pixels(self):
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=160)
        bitmap = _render_char_bitmap(font, "A", target_height=8)
        assert bitmap is not None
        total_ones = sum(row.count("1") for row in bitmap)
        assert total_ones > 0


class TestRasterizeFont:
    @skip_no_font
    def test_produces_raster_result(self):
        result = rasterize_font(SYSTEM_FONT, target_height=8)
        assert isinstance(result, RasterResult)
        assert isinstance(result.font, FontV2)

    @skip_no_font
    def test_glyph_count(self):
        result = rasterize_font(SYSTEM_FONT, target_height=8)
        assert len(result.font.glyphs) >= 60

    @skip_no_font
    def test_height_matches_target(self):
        result = rasterize_font(SYSTEM_FONT, target_height=10)
        assert result.target_height == 10
        # Max glyph height should be close to target
        assert result.font.height <= 12  # some glyphs may be slightly taller after trim

    @skip_no_font
    def test_cursive_sets_spacing_zero(self):
        result = rasterize_font(
            SYSTEM_FONT, target_height=8, opts=FontConversionOptions(is_cursive=True)
        )
        assert result.font.letter_spacing == 0
        assert result.font.category == "script"

    @skip_no_font
    def test_name_override(self):
        result = rasterize_font(
            SYSTEM_FONT,
            target_height=8,
            opts=FontConversionOptions(name="My Font", font_id="my-font"),
        )
        assert result.font.name == "My Font"
        assert result.font.id == "my-font"

    @skip_no_font
    def test_bitmap_width_consistent(self):
        result = rasterize_font(SYSTEM_FONT, target_height=8)
        for char, glyph in result.font.glyphs.items():
            for i, row in enumerate(glyph.bitmap):
                assert len(row) == glyph.width, f"Glyph '{char}' row {i} width mismatch"

    @skip_no_font
    def test_model_dump_produces_valid_json(self):
        result = rasterize_font(SYSTEM_FONT, target_height=8)
        data = result.font.model_dump_json_v2()
        json_str = json.dumps(data)
        parsed = json.loads(json_str)
        assert parsed["version"] == 2
        assert isinstance(parsed["glyphs"], dict)


class TestRasterizeCLI:
    @skip_no_font
    def test_rasterize_command(self, tmp_path):
        from ttf2stitch.cli import cli

        runner = CliRunner()
        output = str(tmp_path / "test.json")
        result = runner.invoke(cli, ["rasterize", SYSTEM_FONT, "--height", "8", "-o", output])
        assert result.exit_code == 0
        assert Path(output).exists()
        data = json.loads(Path(output).read_text())
        assert data["version"] == 2
        assert len(data["glyphs"]) >= 60

    @skip_no_font
    def test_rasterize_with_preview(self):
        from ttf2stitch.cli import cli

        runner = CliRunner()
        result = runner.invoke(
            cli, ["rasterize", SYSTEM_FONT, "--height", "8", "--preview", "-o", "/dev/null"]
        )
        assert result.exit_code == 0
        assert "\u2588" in result.output  # Contains filled block char

    @skip_no_font
    def test_rasterize_different_heights(self, tmp_path):
        from ttf2stitch.cli import cli

        runner = CliRunner()
        for height in (6, 10, 16):
            output = str(tmp_path / f"test-{height}.json")
            result = runner.invoke(
                cli, ["rasterize", SYSTEM_FONT, "--height", str(height), "-o", output]
            )
            assert result.exit_code == 0
            data = json.loads(Path(output).read_text())
            assert data["height"] <= height + 2  # close to target


class TestVerticalProportions:
    """Tests that the uniform vertical frame preserves typographic proportions."""

    @skip_no_font
    def test_uppercase_has_more_ink_rows_than_lowercase(self):
        """'H' should have strictly more rows containing '1' than 'o'."""
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=320)
        bitmap_h = _render_char_bitmap(font, "H", target_height=16)
        bitmap_o = _render_char_bitmap(font, "o", target_height=16)
        assert bitmap_h is not None
        assert bitmap_o is not None
        ink_rows_h = sum(1 for row in bitmap_h if "1" in row)
        ink_rows_o = sum(1 for row in bitmap_o if "1" in row)
        assert ink_rows_h > ink_rows_o

    @skip_no_font
    def test_all_glyphs_uniform_bitmap_height(self):
        """All glyphs from rasterize_font should have exactly the same bitmap height."""
        result = rasterize_font(SYSTEM_FONT, target_height=12)
        heights = {len(g.bitmap) for g in result.font.glyphs.values()}
        assert len(heights) == 1, f"Expected uniform height, got {heights}"

    @skip_no_font
    def test_font_height_equals_target(self):
        """result.font.height should equal target_height exactly."""
        for target in (8, 10, 12, 16):
            result = rasterize_font(SYSTEM_FONT, target_height=target)
            assert result.font.height == target

    @skip_no_font
    def test_vertical_proportions_preserved(self):
        """Uppercase letters should consistently have more ink rows than lowercase."""
        from PIL import ImageFont

        font = ImageFont.truetype(SYSTEM_FONT, size=320)
        pairs = [("H", "o"), ("T", "a"), ("L", "e"), ("B", "c")]
        for upper, lower in pairs:
            bitmap_up = _render_char_bitmap(font, upper, target_height=16)
            bitmap_lo = _render_char_bitmap(font, lower, target_height=16)
            assert bitmap_up is not None, f"Failed to render '{upper}'"
            assert bitmap_lo is not None, f"Failed to render '{lower}'"
            ink_up = sum(1 for row in bitmap_up if "1" in row)
            ink_lo = sum(1 for row in bitmap_lo if "1" in row)
            assert ink_up > ink_lo, (
                f"'{upper}' should have more ink rows ({ink_up}) than '{lower}' ({ink_lo})"
            )

    @skip_no_font
    def test_cap_height_frame_metrics(self):
        """_compute_frame_metrics should produce a tighter frame than full line height."""
        from fontTools.ttLib import TTFont
        from PIL import ImageFont

        from ttf2stitch.rasterizer import _compute_frame_metrics

        render_size = 320
        pil_font = ImageFont.truetype(SYSTEM_FONT, size=render_size)
        ascent_px, descent_px = pil_font.getmetrics()
        full_line = ascent_px + descent_px

        font_obj = TTFont(SYSTEM_FONT)
        try:
            offset, frame_h = _compute_frame_metrics(font_obj, pil_font, render_size)
        finally:
            font_obj.close()

        # Tight frame should be smaller than full line height
        assert frame_h < full_line, f"Tight frame {frame_h} should be < full line {full_line}"
        # Offset should be positive (accent space to skip)
        assert offset > 0, f"Frame offset {offset} should be > 0"
        # Frame should still include descent
        assert frame_h > descent_px, f"Frame {frame_h} should include descent {descent_px}"

    @skip_no_font
    def test_cap_height_proportions_via_rasterize_font(self):
        """rasterize_font should produce clearly different ink spans for upper vs lower."""
        result = rasterize_font(SYSTEM_FONT, target_height=16)
        glyph_a = result.font.glyphs.get("A")
        glyph_o = result.font.glyphs.get("o")
        assert glyph_a is not None
        assert glyph_o is not None

        ink_a = sum(1 for row in glyph_a.bitmap if "1" in row)
        ink_o = sum(1 for row in glyph_o.bitmap if "1" in row)

        # With cap-height frame, uppercase should fill >65% of target height
        assert ink_a >= 11, f"'A' should have >= 11 ink rows at 16h, got {ink_a}"
        # Lowercase should have visibly fewer ink rows (at least 2 fewer)
        assert ink_a - ink_o >= 2, (
            f"'A' ({ink_a}) should have >= 2 more ink rows than 'o' ({ink_o})"
        )
