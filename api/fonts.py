"""Vercel Serverless Function: GET /api/fonts

Lists available TTF/OTF fonts with classification metadata.
"""

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path

FONTS_DIR = Path(__file__).parent.parent / "fonts"
FONT_EXTENSIONS = {".ttf", ".otf"}

# Module-level cache (persists across warm invocations)
_cached_response: str | None = None


def _classify_font(font_path: Path) -> str:
    """Classify a font into a category using OS/2 table + name heuristics."""
    name_lower = font_path.stem.lower()

    if any(kw in name_lower for kw in ("script", "brush", "hand", "cursive", "callig")):
        return "script"
    if any(kw in name_lower for kw in ("mono", "code", "terminal", "console", "courier")):
        return "monospace"
    if any(kw in name_lower for kw in ("pixel", "8bit", "8-bit", "bitmap", "retro")):
        return "monospace"
    if any(
        kw in name_lower
        for kw in (
            "decorat",
            "ornament",
            "fancy",
            "display",
            "grunge",
            "stencil",
            "tattoo",
            "gothic",
            "medieval",
            "western",
            "comic",
        )
    ):
        return "decorative"

    try:
        from fontTools.ttLib import TTFont

        font = TTFont(str(font_path), fontNumber=0)
        os2 = font.get("OS/2")
        if os2:
            panose = getattr(os2, "panose", None)
            if panose:
                ft = panose.bFamilyType
                if ft == 3:
                    font.close()
                    return "script"
                if ft == 4:
                    font.close()
                    return "decorative"
                if ft == 5:
                    font.close()
                    return "decorative"
                if ft == 2:
                    serif_style = panose.bSerifStyle
                    font.close()
                    if serif_style >= 11:
                        return "sans-serif"
                    if 2 <= serif_style <= 10:
                        return "serif"
                    return "sans-serif"

            family_class = getattr(os2, "sFamilyClass", 0)
            high_byte = (family_class >> 8) & 0xFF
            font.close()
            class_map = {
                1: "serif",
                2: "serif",
                3: "serif",
                4: "serif",
                5: "serif",
                7: "serif",
                8: "sans-serif",
                9: "decorative",
                10: "script",
            }
            result = class_map.get(high_byte)
            if result:
                return result
        else:
            font.close()
    except Exception:
        pass

    if "sans" in name_lower or "grotesk" in name_lower or "helvetic" in name_lower:
        return "sans-serif"
    if any(kw in name_lower for kw in ("serif", "roman", "times", "garamond")):
        return "serif"

    return "other"


def _build_font_list() -> list[dict]:
    """Scan fonts directory and build classified font list."""
    fonts = []
    if not FONTS_DIR.is_dir():
        return fonts

    for entry in sorted(FONTS_DIR.iterdir()):
        if entry.suffix.lower() in FONT_EXTENSIONS and entry.is_file():
            fonts.append(
                {
                    "file": entry.name,
                    "name": entry.stem,
                    "size": entry.stat().st_size,
                    "category": _classify_font(entry),
                }
            )
    return fonts


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _cached_response
        if _cached_response is None:
            _cached_response = json.dumps(_build_font_list())

        body = _cached_response.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, s-maxage=3600")
        self.end_headers()
        self.wfile.write(body)
