#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: ./run.sh <command>"
    echo ""
    echo "Commands:"
    echo "  serve      Start dev server on port 8042"
    echo "  test       Run pytest"
    echo "  lint       Run ruff linter"
    echo "  convert    Extract cross-stitch font (pass TTF path + options)"
    echo "  rasterize  Rasterize any TTF/OTF font (pass TTF path + options)"
    echo "  demo       Serve + open browser"
    exit 1
}

[[ $# -lt 1 ]] && usage

cmd="$1"
shift

case "$cmd" in
    serve)
        uv run python serve.py "$@"
        ;;
    test)
        uv run pytest -v "$@"
        ;;
    lint)
        uv run ruff check src/ tests/ "$@"
        ;;
    convert)
        uv run ttf2stitch convert "$@"
        ;;
    rasterize)
        uv run ttf2stitch rasterize "$@"
        ;;
    demo)
        uv run python serve.py "$@" &
        SERVER_PID=$!
        sleep 1
        xdg-open "http://127.0.0.1:8042/public/index.html" 2>/dev/null \
            || open "http://127.0.0.1:8042/public/index.html" 2>/dev/null \
            || echo "Open http://127.0.0.1:8042/public/index.html in your browser"
        wait "$SERVER_PID"
        ;;
    *)
        echo "Unknown command: $cmd"
        usage
        ;;
esac
