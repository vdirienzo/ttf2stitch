"""Pydantic v2 models matching the Stitchx bitmap font JSON v2 format."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class GlyphV2(BaseModel):
    """A single glyph: width + bitmap rows of '0'/'1' strings."""

    width: int
    bitmap: list[str]

    @field_validator("width")
    @classmethod
    def width_positive(cls, v: int) -> int:
        if v < 1:
            msg = f"Glyph width must be >= 1, got {v}"
            raise ValueError(msg)
        return v

    @field_validator("bitmap")
    @classmethod
    def bitmap_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            msg = "Glyph bitmap must have at least one row"
            raise ValueError(msg)
        return v

    @model_validator(mode="after")
    def bitmap_rows_match_width(self) -> "GlyphV2":
        for i, row in enumerate(self.bitmap):
            if len(row) != self.width:
                msg = f"Bitmap row {i} has length {len(row)}, expected {self.width}"
                raise ValueError(msg)
        return self


class FontV2(BaseModel):
    """Complete bitmap font in JSON v2 format for Stitchx."""

    model_config = ConfigDict(
        populate_by_name=True,
    )

    version: Literal[2] = 2
    id: str
    name: str
    height: int
    letter_spacing: int
    space_width: int
    source: str
    license: str
    charset: str
    category: str
    tags: list[str]
    glyphs: dict[str, GlyphV2]

    @field_validator("height")
    @classmethod
    def height_positive(cls, v: int) -> int:
        if v < 1:
            msg = f"Font height must be >= 1, got {v}"
            raise ValueError(msg)
        return v

    @model_validator(mode="after")
    def glyphs_height_consistent(self) -> "FontV2":
        for char, glyph in self.glyphs.items():
            row_count = len(glyph.bitmap)
            if row_count > self.height:
                msg = f"Glyph '{char}' has {row_count} rows, exceeding font height {self.height}"
                raise ValueError(msg)
        return self

    def model_dump_json_v2(self) -> dict:
        """Dump to dict with camelCase keys matching JSON v2 spec."""
        data = self.model_dump()
        # Convert snake_case to camelCase for JSON output
        data["letterSpacing"] = data.pop("letter_spacing")
        data["spaceWidth"] = data.pop("space_width")
        return data
