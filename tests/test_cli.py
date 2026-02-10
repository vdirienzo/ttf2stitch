"""Tests for the CLI entry point using Click's CliRunner."""

import json
import os

import pytest
from click.testing import CliRunner

from tests.conftest import REFERENCE_JSON, skip_no_ttf
from ttf2stitch.cli import cli


@pytest.fixture()
def runner():
    return CliRunner()


class TestCLIBasics:
    def test_help(self, runner):
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Convert TTF/OTF" in result.output

    def test_version(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "0.1.0" in result.output

    def test_unknown_command(self, runner):
        result = runner.invoke(cli, ["nonexistent"])
        assert result.exit_code != 0


class TestValidateCommand:
    def test_validate_reference_file(self, runner):
        result = runner.invoke(cli, ["validate", str(REFERENCE_JSON)])
        # The reference file may have height inconsistency warnings
        # but should not crash
        assert result.exit_code in (0, 1)
        assert "Validation" in result.output

    def test_validate_nonexistent_file(self, runner, tmp_path):
        fake = tmp_path / "nonexistent.json"
        # Click's exists=True check will fail before our validator runs
        result = runner.invoke(cli, ["validate", str(fake)])
        assert result.exit_code != 0


class TestPreviewCommand:
    def test_preview_reference_file(self, runner):
        result = runner.invoke(cli, ["preview", str(REFERENCE_JSON)])
        assert result.exit_code == 0
        assert "Font:" in result.output

    def test_preview_with_chars(self, runner):
        result = runner.invoke(cli, ["preview", str(REFERENCE_JSON), "--chars", "AB"])
        assert result.exit_code == 0
        assert "'A'" in result.output
        assert "'B'" in result.output

    def test_preview_with_text(self, runner):
        result = runner.invoke(cli, ["preview", str(REFERENCE_JSON), "--text", "Hi"])
        assert result.exit_code == 0
        # Should render horizontal text (at least some filled characters)
        assert len(result.output.strip()) > 0


@skip_no_ttf
class TestConvertCommand:
    def test_convert_produces_valid_json(self, runner, tmp_path, acsf_brave_ttf_path):
        output = str(tmp_path / "output.json")
        result = runner.invoke(
            cli,
            [
                "convert",
                acsf_brave_ttf_path,
                "-o",
                output,
                "--cursive",
            ],
        )
        assert result.exit_code == 0, f"CLI failed: {result.output}"
        assert os.path.exists(output)

        with open(output, encoding="utf-8") as f:
            data = json.loads(f.read())
        assert data["version"] == 2
        assert isinstance(data["glyphs"], dict)
        assert len(data["glyphs"]) > 0

    def test_convert_output_file_created(self, runner, tmp_path, acsf_brave_ttf_path):
        output = str(tmp_path / "brave.json")
        result = runner.invoke(
            cli,
            ["convert", acsf_brave_ttf_path, "-o", output, "--cursive"],
        )
        assert result.exit_code == 0
        assert os.path.isfile(output)
        # Check file is non-empty
        assert os.path.getsize(output) > 100

    def test_convert_with_validate(self, runner, tmp_path, acsf_brave_ttf_path):
        output = str(tmp_path / "validated.json")
        result = runner.invoke(
            cli,
            ["convert", acsf_brave_ttf_path, "-o", output, "--cursive", "--validate"],
        )
        assert result.exit_code == 0
        assert "Wrote" in result.output
