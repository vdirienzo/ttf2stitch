# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ttf2stitch** converts TTF/OTF fonts to bitmap JSON v2 format for the [Stitchx](https://stitchx.vercel.app/) cross-stitch web app. Two conversion modes:

- **Extract** (`convert`): For cross-stitch fonts (ACSF family). Detects CELL_UNITS grid, samples cell centers to determine filled stitches.
- **Rasterize** (`rasterize`): For ANY TTF/OTF. Renders at target height (1px = 1 stitch), binarizes with threshold or Otsu's method.

Also includes **Word2Stitch** web app (`public/index.html`) and a **Font Inspector** with pixel editor (`public/inspector.html`).

## Commands

```bash
# Install dependencies
uv sync

# Run tests (136 tests)
uv run pytest -v

# Run a single test file / specific test
uv run pytest tests/test_extractor.py -v
uv run pytest tests/test_schema.py::test_glyph_valid -v

# Lint
uv run ruff check src/ tests/

# CLI usage
uv run ttf2stitch convert path/to/font.ttf --cursive --preview --validate
uv run ttf2stitch rasterize path/to/font.ttf --height 8 --preview
uv run ttf2stitch validate output.json
uv run ttf2stitch preview output.json --text "Hello"

# Convenience script (alternative to uv run)
./run.sh test | lint | convert | rasterize | serve | demo

# Assemble frontend (ui-shell.html + ui-modules/ + pdf-modules/ + shared.js → index.html)
node assemble.js

# Start dev server with font inspector (port 8042)
uv run python serve.py
```

## Architecture

### Hybrid fontTools + PIL Algorithm

Cross-stitch fonts use overlapping X-shaped contours with TrueType winding rules. Direct contour parsing fails (shapes cancel out). Grid-line detection from rendered images also fails (X-marks create false lines). The solution:

1. **fontTools** provides exact glyph bounds in font units → grid dimensions via CELL_UNITS
2. **PIL** renders glyphs at 2000px, samples center 40% of each cell → fill detection only

### Extraction Pipeline (`extractor.py` orchestrator)

```
TTF → cell_detector → filters → renderer (PIL@2000px) → sampler (center 40%) → schema (Pydantic) → JSON v2
```

### Rasterization Pipeline (`rasterizer.py`)

```
Any TTF → render@20x → resize (LANCZOS or max-ink) → binarize (threshold/Otsu) → optional dilate → trim → JSON v2
```

### Key Modules (src/ttf2stitch/)

| Module | Responsibility |
|--------|---------------|
| `cli.py` | Click CLI with lazy imports for fast `--help` |
| `config.py` | Constants: CELL_UNITS lookup, thresholds, charsets |
| `schema.py` | Pydantic v2 models (FontV2, GlyphV2) with validators |
| `extractor.py` | Cross-stitch extraction orchestrator |
| `rasterizer.py` | General font rasterization (dual strategy: average/max-ink) |
| `cell_detector.py` | CELL_UNITS detection: known lookup → auto-detect by divisibility scoring |
| `renderer.py` | PIL high-res glyph rendering |
| `sampler.py` | Cell center sampling + bitmap trimming |
| `filters.py` | Charset filtering + character exclusions |
| `validator.py` | JSON v2 output validation |
| `preview.py` | ASCII art preview |
| `utils.py` | Slug generation, metadata inference, tag detection |

### Web Stack

- `serve.py`: Python HTTP server (:8042) with `/api/rasterize`, `/api/fonts`, `/api/save`, `/api/manifest` endpoints + in-memory rasterization cache
- `assemble.js`: Node script that assembles `ui-shell.html` (HTML template) + `ui-shell.css` + `i18n-data.js` + `data-fonts.js` + `shared.js` + `pdf-modules/` (5 files) + `ui-modules/` (14 files) → `public/index.html` (single self-contained ~195KB file)

## Conventions

- **Python**: snake_case internally. **JSON output**: camelCase (via `model_dump_json_v2()` which converts `letter_spacing` → `letterSpacing`).
- **CLI lazy imports**: Heavy modules (extractor, rasterizer, preview, validator) are imported inside Click commands, not at module level.
- **Shared CLI options**: `shared_extraction_options` decorator applies ~16 common options to `convert` and `batch` commands.
- **Result types**: Pipelines return typed dataclasses (`ExtractionResult`, `RasterResult`), not dicts.
- **CELL_UNITS cascade**: Manual override → known family lookup (ACSF=57) → auto-detection by integer-divisibility scoring (range 20–120).

## Testing

- Tests that require the ACSF Brave TTF file use `@skip_no_ttf` decorator (file at `~/Downloads/fonts/acsf/fonts/ACSF-Brave/acsf-brave-4pt.ttf`).
- Reference fixture: `tests/fixtures/acsf-brave-reference.json`.
- CLI tests use Click's `CliRunner`.

## Config

- **Ruff**: line-length=100, rules: E, F, I, W, UP, B, SIM
- **Python**: >=3.12, src layout, hatchling build backend
- **Package manager**: uv (lockfile: `uv.lock`)
