"""CLI helper functions, decorators, and option definitions for ttf2stitch."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import click

if TYPE_CHECKING:
    from ttf2stitch.utils import FontConversionOptions

# Names of the shared extraction options (used to split kwargs in commands)
_EXTRACT_OPTION_NAMES = (
    "name",
    "font_id",
    "cell_units",
    "render_size",
    "sample_pct",
    "fill_threshold",
    "letter_spacing",
    "space_width",
    "charset",
    "category",
    "source",
    "license_str",
    "tags",
    "exclude_chars",
    "cursive",
    "verbose",
)

# Names of the shared rasterize options (used to split kwargs in rasterize command)
_RASTERIZE_OPTION_NAMES = (
    "name",
    "font_id",
    "letter_spacing",
    "space_width",
    "charset",
    "category",
    "source",
    "license_str",
    "tags",
    "exclude_chars",
    "cursive",
    "verbose",
    "height",
    "threshold",
    "auto_threshold",
    "bold",
    "strategy",
    "no_trim",
)


def shared_extraction_options(func):
    """Decorator that adds common extraction options to a command."""
    options = [
        click.option("--name", default=None, help="Display name override"),
        click.option("--id", "font_id", default=None, help="Font ID override (kebab-case)"),
        click.option("--cell-units", type=int, default=None, help="Override CELL_UNITS"),
        click.option("--render-size", type=int, default=2000, help="PIL render height in px"),
        click.option("--sample-pct", type=float, default=0.4, help="Center sampling percentage"),
        click.option("--fill-threshold", type=float, default=0.15, help="Min fill ratio"),
        click.option("--letter-spacing", type=int, default=1, help="Letter spacing"),
        click.option("--space-width", type=int, default=3, help="Space character width"),
        click.option("--charset", type=click.Choice(["basic", "extended"]), default="basic"),
        click.option(
            "--category",
            type=click.Choice(["serif", "sans-serif", "script", "pixel", "decorative", "gothic"]),
            default=None,
        ),
        click.option("--source", default=None, help="Attribution text"),
        click.option("--license", "license_str", default=None, help="License identifier"),
        click.option("--tags", default=None, help="Comma-separated tags"),
        click.option("--exclude-chars", default="|~_", help="Characters to exclude"),
        click.option("--cursive", is_flag=True, help="Shorthand: spacing=0, category=script"),
        click.option("-v", "--verbose", is_flag=True, help="Verbose output"),
    ]
    for option in reversed(options):
        func = option(func)
    return func


def shared_rasterize_options(func):
    """Decorator that adds rasterize-specific + common font options to a command."""
    options = [
        click.option(
            "--height", type=int, default=8, help="Target height in stitches (default: 8)"
        ),
        click.option(
            "--threshold",
            type=int,
            default=128,
            help="Pixel threshold 0-255 (default: 128, 'auto' via --auto-threshold)",
        ),
        click.option(
            "--auto-threshold",
            is_flag=True,
            help="Auto-detect threshold (Otsu's method, best for decorative fonts)",
        ),
        click.option(
            "--bold",
            type=int,
            default=0,
            help="Thicken strokes by N pixels (1=normal, 2=extra bold)",
        ),
        click.option(
            "--strategy",
            type=click.Choice(["average", "max-ink"]),
            default="average",
            help="average=LANCZOS (clean fonts), max-ink=preserve thin strokes (script)",
        ),
        click.option("--name", default=None, help="Display name override"),
        click.option("--id", "font_id", default=None, help="Font ID override (kebab-case)"),
        click.option("--letter-spacing", type=int, default=1, help="Letter spacing in stitches"),
        click.option(
            "--space-width", type=int, default=3, help="Space character width in stitches"
        ),
        click.option("--charset", type=click.Choice(["basic", "extended"]), default="basic"),
        click.option(
            "--category",
            type=click.Choice(["serif", "sans-serif", "script", "pixel", "decorative", "gothic"]),
            default=None,
        ),
        click.option("--source", default=None, help="Attribution text"),
        click.option("--license", "license_str", default=None, help="License identifier"),
        click.option("--tags", default=None, help="Comma-separated tags"),
        click.option("--exclude-chars", default="", help="Characters to exclude"),
        click.option("--cursive", is_flag=True, help="Shorthand: spacing=0, category=script"),
        click.option("--no-trim", is_flag=True, help="Keep empty border rows/columns"),
        click.option("-v", "--verbose", is_flag=True, help="Verbose output"),
    ]
    for option in reversed(options):
        func = option(func)
    return func


def _build_common_opts(opts: dict) -> FontConversionOptions:
    """Build FontConversionOptions from a CLI option dict."""
    from ttf2stitch.utils import FontConversionOptions

    tags_raw = opts.get("tags")
    tag_list = [t.strip() for t in tags_raw.split(",")] if tags_raw else None
    exclude = set(opts["exclude_chars"]) if opts.get("exclude_chars") else set()

    return FontConversionOptions(
        name=opts["name"],
        font_id=opts["font_id"],
        letter_spacing=opts["letter_spacing"],
        space_width=opts["space_width"],
        charset=opts["charset"],
        category=opts["category"],
        source=opts["source"],
        license_str=opts["license_str"],
        tags=tag_list,
        exclude_chars=exclude,
        is_cursive=opts["cursive"],
        verbose=opts["verbose"],
    )


def _build_extract_kwargs(opts: dict) -> dict:
    """Convert CLI option dict into kwargs for extract_font()."""
    return {
        "opts": _build_common_opts(opts),
        "cell_units": opts["cell_units"],
        "render_size": opts["render_size"],
        "sample_pct": opts["sample_pct"],
        "fill_threshold": opts["fill_threshold"],
    }


def _build_rasterize_kwargs(opts: dict) -> dict:
    """Convert CLI option dict into kwargs for rasterize_font()."""
    return {
        "opts": _build_common_opts(opts),
        "target_height": opts["height"],
        "threshold": None if opts["auto_threshold"] else opts["threshold"],
        "bold": opts["bold"],
        "strategy": opts["strategy"],
        "trim": not opts["no_trim"],
    }


def _split_kwargs(all_kwargs: dict) -> tuple[dict, dict]:
    """Split kwargs into (extraction_opts, command_opts)."""
    ext = {k: all_kwargs[k] for k in _EXTRACT_OPTION_NAMES}
    cmd = {k: v for k, v in all_kwargs.items() if k not in _EXTRACT_OPTION_NAMES}
    return ext, cmd


def _split_rasterize_kwargs(all_kwargs: dict) -> tuple[dict, dict]:
    """Split kwargs into (rasterize_opts, command_opts)."""
    rast = {k: all_kwargs[k] for k in _RASTERIZE_OPTION_NAMES}
    cmd = {k: v for k, v in all_kwargs.items() if k not in _RASTERIZE_OPTION_NAMES}
    return rast, cmd


def _write_result(result: Any, output_path: str) -> dict:
    """Write extraction result to JSON, return the serialized data dict."""
    data = result.font.model_dump_json_v2()
    Path(output_path).write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return data


def _print_result_summary(result: Any, output_path: str) -> None:
    """Print standard summary after a successful conversion."""
    click.secho(f"Wrote {output_path}", fg="green")
    click.echo(f"  Font: {result.font.name} ({result.font.id})")
    click.echo(f"  Glyphs: {len(result.font.glyphs)}, Height: {result.font.height}")
    click.echo(f"  Cell units: {result.cell_units} (confidence: {result.confidence:.2f})")
    if result.skipped_chars:
        click.secho(f"  Skipped: {', '.join(result.skipped_chars)}", fg="yellow")


def _show_output(data: dict, preview: bool, do_validate: bool) -> None:
    """Show optional preview and/or validation results."""
    if preview:
        from ttf2stitch.preview import preview_font as show_preview

        click.echo("\n" + show_preview(data, "ABCabc123"))

    if do_validate:
        from ttf2stitch.validator import validate_font

        issues = validate_font(data)
        if issues:
            click.secho(f"\n  Validation issues ({len(issues)}):", fg="yellow")
            for issue in issues:
                click.echo(f"    - {issue}")
        else:
            click.secho("  Validation passed", fg="green")
