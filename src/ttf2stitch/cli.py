"""CLI entry point for ttf2stitch - convert TTF/OTF cross-stitch fonts to bitmap JSON v2."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import click

from ttf2stitch.cli_helpers import (
    _build_extract_kwargs,
    _build_rasterize_kwargs,
    _print_result_summary,
    _show_output,
    _split_kwargs,
    _split_rasterize_kwargs,
    _write_result,
    shared_extraction_options,
    shared_rasterize_options,
)
from ttf2stitch.config import CONFIDENCE_WARNING

# -- CLI group --------------------------------------------------------------------------


@click.group()
@click.version_option(version="0.1.0", prog_name="ttf2stitch")
@click.option("-v", "--verbose", is_flag=True, hidden=True, help="Verbose output")
@click.pass_context
def cli(ctx: click.Context, verbose: bool):
    """Convert TTF/OTF cross-stitch fonts to bitmap JSON v2 for Stitchx."""
    if verbose:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


# -- convert ---------------------------------------------------------------------------


@cli.command()
@click.argument("font_path", type=click.Path(exists=True))
@click.option("-o", "--output", type=click.Path(), default=None, help="Output JSON path")
@click.option("--preview/--no-preview", default=False, help="Show ASCII preview")
@click.option("--validate/--no-validate", "do_validate", default=False, help="Validate output")
@shared_extraction_options
def convert(font_path, **all_kwargs):
    """Convert a TTF/OTF cross-stitch font to bitmap JSON v2."""
    ext_opts, cmd = _split_kwargs(all_kwargs)
    if ext_opts["verbose"]:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from ttf2stitch.extractor import extract_font

    try:
        result = extract_font(font_path, **_build_extract_kwargs(ext_opts))
    except Exception as e:
        click.secho(f"Error: {e}", fg="red", err=True)
        sys.exit(1)

    output = cmd["output"] or f"{result.font.id}.json"
    data = _write_result(result, output)
    _print_result_summary(result, output)
    _show_output(data, cmd["preview"], cmd["do_validate"])


# -- batch -----------------------------------------------------------------------------


@cli.command()
@click.argument("input_dir", type=click.Path(exists=True, file_okay=False))
@click.option("-o", "--output-dir", type=click.Path(), default=None, help="Output directory")
@click.option("--preview/--no-preview", default=False, help="Show ASCII preview per font")
@click.option("--validate/--no-validate", "do_validate", default=False, help="Validate each output")
@shared_extraction_options
def batch(input_dir, **all_kwargs):
    """Batch-convert all TTF/OTF files in a directory."""
    ext_opts, cmd = _split_kwargs(all_kwargs)
    if ext_opts["verbose"]:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from ttf2stitch.extractor import extract_font

    input_path = Path(input_dir)
    font_files = sorted(p for p in input_path.iterdir() if p.suffix.lower() in (".ttf", ".otf"))

    if not font_files:
        click.secho(f"No TTF/OTF files found in {input_dir}", fg="yellow")
        return

    out_dir = Path(cmd["output_dir"]) if cmd["output_dir"] else input_path
    out_dir.mkdir(parents=True, exist_ok=True)
    click.echo(f"Processing {len(font_files)} font(s) from {input_dir}...\n")

    success, failed = 0, 0
    for font_file in font_files:
        click.echo(f"--- {font_file.name} ---")
        per_file_opts = {**ext_opts, "name": None, "font_id": None}

        try:
            result = extract_font(str(font_file), **_build_extract_kwargs(per_file_opts))
        except Exception as e:
            click.secho(f"  Error: {e}", fg="red", err=True)
            failed += 1
            continue

        out_file = str(out_dir / f"{result.font.id}.json")
        data = _write_result(result, out_file)
        _print_result_summary(result, out_file)

        _show_output(data, cmd["preview"], cmd["do_validate"])
        success += 1
        click.echo()

    click.echo(f"Done: {success} succeeded, {failed} failed out of {len(font_files)}.")


# -- inspect ---------------------------------------------------------------------------


@cli.command()
@click.argument("font_path", type=click.Path(exists=True))
@click.option("--cell-units", type=int, default=None, help="Override CELL_UNITS")
@click.option("-v", "--verbose", is_flag=True, help="Verbose output")
def inspect(font_path, cell_units, verbose):
    """Analyze a TTF/OTF font without converting. Shows metrics and recommended flags."""
    if verbose:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from ttf2stitch.cell_detector import detect_cell_units, get_glyph_dimensions
    from ttf2stitch.utils import infer_category, infer_metadata

    click.echo(f"Inspecting: {font_path}\n")

    try:
        metadata = infer_metadata(font_path)
    except Exception as e:
        click.secho(f"Error reading font metadata: {e}", fg="red", err=True)
        sys.exit(1)

    click.echo(f"  Name:    {metadata['name'] or '(unknown)'}")
    click.echo(f"  License: {metadata['license'][:80] or '(unknown)'}")
    click.echo(f"  Source:  {metadata['source'] or '(unknown)'}")

    inferred_cat = infer_category(metadata["name"], metadata)
    click.echo(f"  Category (inferred): {inferred_cat}")

    try:
        detected_units, confidence = detect_cell_units(font_path, cell_units)
    except Exception as e:
        click.secho(f"Error detecting cell units: {e}", fg="red", err=True)
        sys.exit(1)

    click.echo(f"\n  Cell units: {detected_units} (confidence: {confidence:.2f})")
    if confidence < CONFIDENCE_WARNING:
        click.secho("  Low confidence! Consider using --cell-units to override.", fg="yellow")

    try:
        dimensions = get_glyph_dimensions(font_path)
    except Exception as e:
        click.secho(f"Error reading glyph dimensions: {e}", fg="red", err=True)
        sys.exit(1)

    if dimensions:
        widths = [w for w, _ in dimensions]
        heights = [h for _, h in dimensions]
        click.echo(f"\n  Glyph count (A-Z): {len(dimensions)}")
        click.echo(f"  Width range:  {min(widths):.0f} - {max(widths):.0f} font units")
        click.echo(f"  Height range: {min(heights):.0f} - {max(heights):.0f} font units")
        if detected_units > 0:
            col_range = [round(w / detected_units) for w in widths]
            row_range = [round(h / detected_units) for h in heights]
            click.echo(f"  Grid cols:    {min(col_range)} - {max(col_range)} cells")
            click.echo(f"  Grid rows:    {min(row_range)} - {max(row_range)} cells")

    click.echo("\n  Recommended convert command:")
    parts = ["ttf2stitch convert", f'"{font_path}"']
    if cell_units:
        parts.append(f"--cell-units {cell_units}")
    parts.append(f"--category {inferred_cat}")
    click.echo(f"    {' '.join(parts)}")


# -- rasterize -------------------------------------------------------------------------


@cli.command()
@click.argument("font_path", type=click.Path(exists=True))
@click.option("-o", "--output", type=click.Path(), default=None, help="Output JSON path")
@click.option("--preview/--no-preview", default=False, help="Show ASCII preview")
@click.option("--validate/--no-validate", "do_validate", default=False, help="Validate output")
@shared_rasterize_options
def rasterize(font_path, **all_kwargs):
    """Rasterize ANY TTF/OTF font at a fixed stitch height (1 pixel = 1 stitch)."""
    rast_opts, cmd = _split_rasterize_kwargs(all_kwargs)
    if rast_opts["verbose"]:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from ttf2stitch.rasterizer import rasterize_font

    try:
        result = rasterize_font(font_path, **_build_rasterize_kwargs(rast_opts))
    except Exception as e:
        click.secho(f"Error: {e}", fg="red", err=True)
        sys.exit(1)

    output = cmd["output"] or f"{result.font.id}.json"
    data = _write_result(result, output)

    click.secho(f"Wrote {output}", fg="green")
    click.echo(f"  Font: {result.font.name} ({result.font.id})")
    click.echo(f"  Glyphs: {len(result.font.glyphs)}, Height: {result.font.height}")
    click.echo(f"  Target: {result.target_height} stitches tall")

    if result.skipped_chars:
        click.secho(f"  Skipped: {', '.join(result.skipped_chars)}", fg="yellow")

    _show_output(data, cmd["preview"], cmd["do_validate"])


# -- validate --------------------------------------------------------------------------


@cli.command("validate")
@click.argument("json_path", type=click.Path(exists=True))
def validate_cmd(json_path):
    """Validate an existing bitmap font JSON v2 file."""
    from ttf2stitch.validator import validate_file

    issues = validate_file(json_path)
    if not issues:
        click.secho(f"Validation passed: {json_path}", fg="green")
        return

    click.secho(f"Validation issues in {json_path} ({len(issues)}):", fg="yellow")
    for issue in issues:
        click.echo(f"  - {issue}")
    sys.exit(1)


# -- preview ---------------------------------------------------------------------------


@cli.command("preview")
@click.argument("json_path", type=click.Path(exists=True))
@click.option("--chars", default=None, help="Characters to preview (default: all)")
@click.option("--text", default=None, help="Render a line of text horizontally")
def preview_cmd(json_path, chars, text):
    """Show ASCII preview of glyphs in a bitmap font JSON v2 file."""
    from ttf2stitch.preview import preview_font as show_preview
    from ttf2stitch.preview import preview_text as show_text

    try:
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        click.secho(f"Error reading {json_path}: {e}", fg="red", err=True)
        sys.exit(1)

    font_name = data.get("name", "(unknown)")
    glyph_count = len(data.get("glyphs", {}))
    click.echo(f"Font: {font_name} ({glyph_count} glyphs)\n")

    if text:
        click.echo(show_text(data, text))
    else:
        click.echo(show_preview(data, chars))
