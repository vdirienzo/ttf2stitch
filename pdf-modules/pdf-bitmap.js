// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Bitmap
//  Converts text strings to 2D boolean bitmaps using font glyph data
// ══════════════════════════════════════════════════════════════════

/**
 * Convert text string to a 2D boolean bitmap using bitmap font glyph data.
 * Handles letter spacing, space width, and missing glyphs gracefully.
 *
 * @param {string} text - The text to render
 * @param {object} fontData - Font object with glyphs, height, letterSpacing, spaceWidth
 * @returns {boolean[][]} 2D array where true = filled stitch, false = empty
 */
function getTextBitmapForPDF(text, fontData) {
  if (!text || !fontData || !fontData.glyphs) return [];

  const glyphs = fontData.glyphs;
  const letterSpacing = fontData.letterSpacing ?? 1;
  const spaceWidth = fontData.spaceWidth ?? 3;

  // Determine the max glyph height from the font data
  const fontHeight = fontData.height || Math.max(
    1,
    ...Object.values(glyphs).map(g =>
      g.bitmap ? g.bitmap.length : 0
    )
  );

  // Build columns for each character, then concatenate
  const charColumns = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // Add spacing between characters (not before the first one)
    if (i > 0 && letterSpacing > 0) {
      for (let s = 0; s < letterSpacing; s++) {
        const emptyCol = new Array(fontHeight).fill(false);
        charColumns.push(emptyCol);
      }
    }

    if (ch === ' ' || !glyphs[ch]) {
      // Space or missing glyph: insert empty columns
      const w = spaceWidth;
      for (let s = 0; s < w; s++) {
        charColumns.push(new Array(fontHeight).fill(false));
      }
      continue;
    }

    const glyph = glyphs[ch];
    const bitmap = glyph.bitmap || [];
    const glyphWidth = glyph.width || (bitmap[0] ? bitmap[0].length : 0);
    const glyphHeight = bitmap.length;

    // Vertically align glyph to bottom of font height
    const yOffset = fontHeight - glyphHeight;

    for (let col = 0; col < glyphWidth; col++) {
      const column = new Array(fontHeight).fill(false);
      for (let row = 0; row < glyphHeight; row++) {
        if (bitmap[row] && col < bitmap[row].length && bitmap[row][col] === '1') {
          column[yOffset + row] = true;
        }
      }
      charColumns.push(column);
    }
  }

  if (charColumns.length === 0) return [];

  // Convert column-based data to row-based 2D array
  const width = charColumns.length;
  const result = [];
  for (let row = 0; row < fontHeight; row++) {
    const rowData = [];
    for (let col = 0; col < width; col++) {
      rowData.push(charColumns[col][row]);
    }
    result.push(rowData);
  }

  return result;
}
