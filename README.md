# ttf2stitch

Convert TTF/OTF cross-stitch fonts to bitmap JSON v2 format for [Stitchx](https://stitchx.vercel.app/).

## Installation

```bash
git clone <repo-url>
cd ttf2stitch
uv sync
```

## Usage

### Convert a font

```bash
# Basic conversion
ttf2stitch convert path/to/font.ttf

# Cursive cross-stitch font (sets spacing=0, category=script)
ttf2stitch convert path/to/ACSFBrave.ttf --cursive --preview --validate

# Override cell units for non-ACSF fonts
ttf2stitch convert path/to/font.otf --cell-units 50 --category pixel
```

### Batch convert

```bash
ttf2stitch batch path/to/fonts/ --output-dir output/ --cursive
```

### Inspect a font (without converting)

```bash
ttf2stitch inspect path/to/font.ttf
```

Shows: name, glyph count, grid dimensions, auto-detected CELL_UNITS with confidence score, and recommended flags.

### Validate output

```bash
ttf2stitch validate output.json
```

### Preview glyphs

```bash
ttf2stitch preview output.json --chars "ABC"
ttf2stitch preview output.json --text "Hello World"
```

## Algorithm

The hybrid **fontTools + PIL** method:

1. **fontTools** reads exact glyph bounds in font units
2. **CELL_UNITS** detection: known-family lookup (ACSF=57) or auto-detect by integer-divisibility scoring
3. Grid dimensions computed: `cols = round(width / cell_units)`, `rows = round(height / cell_units)`
4. **PIL** renders each character at 2000px using `textbbox()` for precise glyph bounds
5. Center 40% of each cell sampled; dark pixel ratio > 15% = filled stitch
6. Output assembled as JSON v2 with Pydantic validation

### Why hybrid?

Cross-stitch TTF fonts use overlapping X-shaped contours with TrueType winding rules. Parsing contours directly fails (overlapping shapes cancel). Detecting grid lines from rendered images fails (X-marks create false grid lines). The hybrid approach uses font metrics for precise grid dimensions and PIL rendering only for fill detection.

## Output Format

```json
{
  "version": 2,
  "id": "acsf-brave",
  "name": "ACSF Brave",
  "height": 11,
  "letterSpacing": 0,
  "spaceWidth": 3,
  "source": "P. Baudin",
  "license": "OFL-1.1",
  "charset": "basic",
  "category": "script",
  "tags": ["cursive", "cross-stitch"],
  "glyphs": {
    "A": { "width": 5, "bitmap": ["00100", "00100", "01010", "01010", "11111", "10001", "10001"] }
  }
}
```

## Development

```bash
uv run pytest -v          # Run tests (136 tests)
uv run ruff check src/    # Lint
```

## License

MIT
