#!/usr/bin/env bash
# run.sh — Quick-start script for ttf2stitch
#
# Usage:
#   ./run.sh                              # Convert all ACSF fonts
#   ./run.sh rasterize <font> [height]    # Rasterize ANY font at N stitches tall
#   ./run.sh convert <font>               # Convert a cross-stitch font
#   ./run.sh inspect <font>               # Inspect a font
#   ./run.sh validate <json>              # Validate a JSON output
#   ./run.sh preview <json>               # Preview a JSON output
#   ./run.sh test                         # Run test suite
#   ./run.sh lint                         # Run linter
#   ./run.sh demo                         # Convert ACSF Brave + show preview

set -euo pipefail
cd "$(dirname "$0")"

ACSF_DIR="$HOME/Downloads/fonts/acsf/fonts"
OUTPUT_DIR="./output"
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

header() { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

# Ensure dependencies are installed
if [ ! -d ".venv" ]; then
    header "Installing dependencies"
    uv sync
fi

cmd="${1:-all}"
shift 2>/dev/null || true

case "$cmd" in
    serve|s)
        # Start local server with font inspector + pixel editor (auto-save)
        header "Font Inspector + Pixel Editor"
        mkdir -p "$OUTPUT_DIR"
        uv run python serve.py "${1:-8042}"
        ;;

    rasterize|r)
        # Rasterize any font: ./run.sh rasterize path/to/font.ttf [height] [extra flags]
        font="$1"; shift
        height="${1:-8}"
        # If height is a number, consume it; otherwise keep it as a flag
        if [[ "$height" =~ ^[0-9]+$ ]]; then
            shift
            uv run ttf2stitch rasterize "$font" --height "$height" --preview "$@"
        else
            uv run ttf2stitch rasterize "$font" --height 8 --preview "$height" "$@"
        fi
        ;;

    convert)
        # Convert a cross-stitch font: ./run.sh convert path/to/font.ttf [extra flags]
        uv run ttf2stitch convert "$@"
        ;;

    inspect)
        uv run ttf2stitch inspect "$@"
        ;;

    validate)
        uv run ttf2stitch validate "$@"
        ;;

    preview)
        uv run ttf2stitch preview "$@"
        ;;

    test)
        header "Running tests"
        uv run pytest -v "$@"
        ;;

    lint)
        header "Linting"
        uv run ruff check src/ tests/ "$@"
        ;;

    demo)
        # Quick demo: convert ACSF Brave and show preview
        header "Demo: ACSF Brave"
        if [ ! -f "$ACSF_DIR/ACSF-Brave/acsf-brave-4pt.ttf" ]; then
            echo -e "${YELLOW}ACSF fonts not found at $ACSF_DIR${NC}"
            echo "Download from: https://github.com/pbaudin/ACSF"
            exit 1
        fi
        mkdir -p "$OUTPUT_DIR"
        uv run ttf2stitch convert "$ACSF_DIR/ACSF-Brave/acsf-brave-4pt.ttf" \
            --cursive --preview --validate \
            --name "ACSF Brave" --id "acsf-brave" \
            --source "P. Baudin (github.com/pbaudin/ACSF)" \
            --license "OFL-1.1" \
            -o "$OUTPUT_DIR/acsf-brave.json"

        echo -e "\n${CYAN}Text preview:${NC}"
        uv run ttf2stitch preview "$OUTPUT_DIR/acsf-brave.json" --text "Hello World"
        ;;

    all)
        # Convert all ACSF fonts (regular weight only)
        header "Batch converting ACSF fonts"
        if [ ! -d "$ACSF_DIR" ]; then
            echo -e "${YELLOW}ACSF fonts not found at $ACSF_DIR${NC}"
            echo "Download from: https://github.com/pbaudin/ACSF"
            echo ""
            echo "Tip: Use 'rasterize' for any font:"
            echo "  ./run.sh rasterize /path/to/font.ttf 8"
            exit 1
        fi

        mkdir -p "$OUTPUT_DIR"
        success=0
        failed=0

        for family_dir in "$ACSF_DIR"/ACSF-*/; do
            family=$(basename "$family_dir")
            # Find the regular-weight TTF (not *-light.ttf)
            ttf=$(find "$family_dir" -name "*.ttf" ! -name "*-light*" | head -1)
            [ -z "$ttf" ] && continue

            echo -e "${BOLD}── $family ──${NC}"
            slug=$(echo "$family" | tr '[:upper:]' '[:lower:]')

            if uv run ttf2stitch convert "$ttf" \
                --cursive \
                --source "P. Baudin (github.com/pbaudin/ACSF)" \
                --license "OFL-1.1" \
                -o "$OUTPUT_DIR/$slug.json" 2>&1; then
                success=$((success + 1))
            else
                echo -e "${YELLOW}  Failed${NC}"
                failed=$((failed + 1))
            fi
            echo ""
        done

        header "Summary"
        echo -e "${GREEN}Converted: $success${NC}"
        [ "$failed" -gt 0 ] && echo -e "${YELLOW}Failed: $failed${NC}"
        echo -e "Output dir: ${BOLD}$OUTPUT_DIR/${NC}"
        echo ""
        ls -lh "$OUTPUT_DIR"/*.json 2>/dev/null
        ;;

    *)
        echo "Unknown command: $cmd"
        echo ""
        echo "Usage: ./run.sh <command>"
        echo ""
        echo "  rasterize <font> [height]  Rasterize ANY font (1px=1stitch, default 8)"
        echo "  convert <font.ttf>         Convert a cross-stitch font (ACSF etc.)"
        echo "  inspect <font.ttf>         Analyze without converting"
        echo "  validate <out.json>        Validate JSON output"
        echo "  preview <out.json>         ASCII preview"
        echo "  demo                       Convert ACSF Brave + preview"
        echo "  all                        Batch convert all ACSF fonts"
        echo "  test                       Run test suite"
        echo "  lint                       Run linter"
        echo ""
        echo "Examples:"
        echo "  ./run.sh rasterize /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf 8"
        echo "  ./run.sh rasterize ~/Downloads/chandia/Chandia.otf 12"
        exit 1
        ;;
esac
