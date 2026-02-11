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
