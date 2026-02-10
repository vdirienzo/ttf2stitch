"""Shared fixtures for ttf2stitch tests."""

import json
import os
from pathlib import Path

import pytest
from PIL import Image

# -- Paths ------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent / "fixtures"
REFERENCE_JSON = FIXTURES_DIR / "acsf-brave-reference.json"
ACSF_BRAVE_TTF = "/home/user/Downloads/fonts/acsf/fonts/ACSF-Brave/acsf-brave-4pt.ttf"

HAS_ACSF_TTF = os.path.exists(ACSF_BRAVE_TTF)

skip_no_ttf = pytest.mark.skipif(not HAS_ACSF_TTF, reason="ACSF Brave TTF not found")


# -- Simple data fixtures ---------------------------------------------------


@pytest.fixture()
def sample_glyph_data():
    """A dict matching the GlyphV2 format (a small diamond shape)."""
    return {
        "width": 3,
        "bitmap": ["010", "101", "010"],
    }


@pytest.fixture()
def sample_font_data():
    """A minimal FontV2 JSON v2 dict (camelCase keys) with a few test glyphs."""
    return {
        "version": 2,
        "id": "test-font",
        "name": "Test Font",
        "height": 3,
        "letterSpacing": 1,
        "spaceWidth": 3,
        "source": "Test Author",
        "license": "MIT",
        "charset": "basic",
        "category": "sans-serif",
        "tags": ["test", "cross-stitch"],
        "glyphs": {
            "A": {"width": 3, "bitmap": ["010", "101", "111"]},
            "B": {"width": 3, "bitmap": ["110", "111", "110"]},
            "1": {"width": 2, "bitmap": ["10", "10", "10"]},
        },
    }


@pytest.fixture()
def reference_font_path():
    """Path to the ACSF Brave reference JSON fixture."""
    return str(REFERENCE_JSON)


@pytest.fixture()
def acsf_brave_ttf_path():
    """Path to the ACSF Brave TTF file (may not exist)."""
    return ACSF_BRAVE_TTF


@pytest.fixture()
def checkerboard_image():
    """A grayscale PIL Image with a 4x4 checkerboard of 50px cells.

    Black cells (0) at even positions, white cells (255) at odd positions
    when (row + col) is even => black, odd => white.
    Total image: 200x200 pixels.
    """
    cell_size = 50
    grid_size = 4
    img_size = cell_size * grid_size
    img = Image.new("L", (img_size, img_size), 255)

    for row in range(grid_size):
        for col in range(grid_size):
            if (row + col) % 2 == 0:
                # Black cell
                for y in range(row * cell_size, (row + 1) * cell_size):
                    for x in range(col * cell_size, (col + 1) * cell_size):
                        img.putpixel((x, y), 0)

    return img


@pytest.fixture()
def tmp_output_dir(tmp_path):
    """Temporary directory for output files."""
    return tmp_path


@pytest.fixture()
def reference_font_data():
    """Load and return the ACSF Brave reference JSON as a dict."""
    return json.loads(REFERENCE_JSON.read_text(encoding="utf-8"))
