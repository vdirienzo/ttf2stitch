"""Constants and configuration for ttf2stitch."""

# Known CELL_UNITS for font families (stitch cell size in font units)
# ACSF fonts use 57 units per cell: 44 stitch area + 13 gap between cells
KNOWN_CELL_UNITS: dict[str, int] = {
    "acsf": 57,
}

# Auto-detection range for CELL_UNITS when font family is unknown
CELL_UNITS_MIN = 20
CELL_UNITS_MAX = 120

# Confidence thresholds for auto-detected cell size
CONFIDENCE_AUTO = 0.9  # Use automatically without user confirmation
CONFIDENCE_WARNING = 0.7  # Warn but continue
# Below 0.7 = abort, require --cell-units override

# Rendering defaults
DEFAULT_RENDER_SIZE = 2000  # PIL render height in pixels (large enough to avoid X-mark bleed)
DEFAULT_SAMPLE_PCT = 0.4  # Sample center 40% of each cell
DEFAULT_FILL_THRESHOLD = 0.15  # Minimum fill ratio to consider a cell as stitched

# Font output defaults
DEFAULT_LETTER_SPACING = 1
DEFAULT_SPACE_WIDTH = 3

# Charsets
BASIC_CHARSET = set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !\"#%&'()*+,-./:;?"
)
EXTENDED_CHARSET = BASIC_CHARSET | set("@$^[]{}\\<>=_`~")

# Default excluded characters (special TTF cross-stitch font chars)
# | = 36-stitch bar, ~ = 1pt space, _ = 20-stitch fill area
DEFAULT_EXCLUDE_CHARS = set("|~_")

# Valid font categories for the output JSON
VALID_CATEGORIES = ("serif", "sans-serif", "script", "pixel", "decorative", "gothic")
