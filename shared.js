// shared.js — Unified bitmap utilities used by both UI and PDF engine
// Loaded before pdf-modules and ui-modules by assemble.js

/**
 * Trim trailing empty rows from a glyph bitmap.
 * Returns only the rows up to and including the last row containing a '1'.
 *
 * @param {object} glyph - Glyph object with .bitmap (array of strings)
 * @returns {string[]} Trimmed bitmap rows
 */
function getEffectiveBitmap(glyph) {
  if (!glyph || !glyph.bitmap || !glyph.bitmap.length) return [];
  var bitmap = glyph.bitmap;
  var lastFilledRow = -1;
  for (var r = bitmap.length - 1; r >= 0; r--) {
    if (bitmap[r].indexOf('1') !== -1) { lastFilledRow = r; break; }
  }
  if (lastFilledRow === -1) return [];
  return bitmap.slice(0, lastFilledRow + 1);
}

/**
 * Convert a text string to a 2D bitmap using bitmap font glyph data.
 * Supports both UI (top-aligned, boolean) and PDF (bottom-aligned, boolean) use cases.
 *
 * @param {string} text - The text to render
 * @param {object} fontData - Font object with glyphs, height, letterSpacing, spaceWidth
 * @param {object} [options] - Rendering options
 * @param {string} [options.align='bottom'] - Vertical glyph alignment:
 *   'bottom' (default): glyph rows start at top of cell, empty space at bottom
 *   'top': glyph rows pushed to bottom of cell, empty space at top
 * @param {string} [options.format='boolean'] - Cell value format:
 *   'boolean' (default): cells are true/false
 *   'string': cells are '1'/'0'
 * @returns {{ bitmap: Array[], width: number, height: number }}
 */
function getTextBitmap(text, fontData, options) {
  options = options || {};
  var align = options.align || 'bottom';
  var format = options.format || 'boolean';

  if (!text || !fontData || !fontData.glyphs) return { bitmap: [], width: 0, height: 0 };

  var glyphs = fontData.glyphs;
  var height = fontData.height || 9;
  var letterSpacing = (fontData.letterSpacing != null) ? fontData.letterSpacing : 1;
  var spaceWidth = fontData.spaceWidth || 3;
  var columns = [];

  var falseVal = (format === 'string') ? '0' : false;
  var trueVal = (format === 'string') ? '1' : true;

  for (var ci = 0; ci < text.length; ci++) {
    var ch = text[ci];

    // Letter spacing between characters (not before the first)
    if (ci > 0 && letterSpacing > 0) {
      for (var s = 0; s < letterSpacing; s++) columns.push(newEmptyCol(height, falseVal));
    }

    // Space or missing/empty glyph: insert empty columns
    if (ch === ' ' || !glyphs[ch] || !glyphs[ch].bitmap || !glyphs[ch].bitmap.length) {
      for (var sw = 0; sw < spaceWidth; sw++) columns.push(newEmptyCol(height, falseVal));
      continue;
    }

    var glyph = glyphs[ch];
    var bmp = glyph.bitmap;
    var glyphWidth = glyph.width || (bmp[0] ? bmp[0].length : 0);
    var glyphHeight = bmp.length;

    // 'top' alignment: push glyph down so empty space is at the top of the cell
    // 'bottom' (default): glyph starts at row 0, empty space at bottom
    var yOffset = (align === 'top') ? (height - glyphHeight) : 0;

    for (var x = 0; x < glyphWidth; x++) {
      var col = newEmptyCol(height, falseVal);
      for (var row = 0; row < glyphHeight; row++) {
        if (row < bmp.length && x < bmp[row].length && bmp[row][x] === '1') {
          col[yOffset + row] = trueVal;
        }
      }
      columns.push(col);
    }
  }

  if (!columns.length) return { bitmap: [], width: 0, height: 0 };

  // Transpose columns to rows
  var width = columns.length;
  var bitmap = [];
  for (var y = 0; y < height; y++) {
    var row = [];
    for (var x2 = 0; x2 < width; x2++) row.push(columns[x2][y]);
    bitmap.push(row);
  }
  return { bitmap: bitmap, width: width, height: height };
}

function newEmptyCol(height, fillValue) {
  var col = new Array(height);
  for (var i = 0; i < height; i++) col[i] = fillValue;
  return col;
}
