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
 * Render a single line of text to a 2D bitmap.
 * This is the core single-line logic extracted from getTextBitmap.
 *
 * @param {string} lineText - Single line of text (no newlines)
 * @param {object} fontData - Font object with glyphs, height, letterSpacing, spaceWidth
 * @param {object} [options] - Rendering options (align, format)
 * @returns {{ bitmap: Array[], width: number, height: number }}
 */
function getLineBitmap(lineText, fontData, options) {
  options = options || {};
  var align = options.align || 'bottom';
  var format = options.format || 'boolean';

  if (!lineText || !fontData || !fontData.glyphs) return { bitmap: [], width: 0, height: 0 };

  var glyphs = fontData.glyphs;
  var height = fontData.height || 9;
  var letterSpacing = (fontData.letterSpacing != null) ? fontData.letterSpacing : 1;
  var spaceWidth = fontData.spaceWidth || 3;
  var columns = [];

  var falseVal = (format === 'string') ? '0' : false;
  var trueVal = (format === 'string') ? '1' : true;

  for (var ci = 0; ci < lineText.length; ci++) {
    var ch = lineText[ci];

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

/**
 * Convert a text string to a 2D bitmap using bitmap font glyph data.
 * Supports multi-line text (split by \n) with horizontal alignment.
 * Supports both UI (top-aligned, boolean) and PDF (bottom-aligned, boolean) use cases.
 *
 * @param {string} text - The text to render (may contain \n for multi-line)
 * @param {object} fontData - Font object with glyphs, height, letterSpacing, spaceWidth
 * @param {object} [options] - Rendering options
 * @param {string} [options.align='bottom'] - Vertical glyph alignment:
 *   'bottom' (default): glyph rows start at top of cell, empty space at bottom
 *   'top': glyph rows pushed to bottom of cell, empty space at top
 * @param {string} [options.format='boolean'] - Cell value format:
 *   'boolean' (default): cells are true/false
 *   'string': cells are '1'/'0'
 * @param {string} [options.textAlign='left'] - Horizontal text alignment:
 *   'left' (default), 'center', 'right'
 * @returns {{ bitmap: Array[], width: number, height: number }}
 */
function getTextBitmap(text, fontData, options) {
  options = options || {};
  var textAlign = options.textAlign || 'left';
  var format = options.format || 'boolean';

  if (!text || !fontData || !fontData.glyphs) return { bitmap: [], width: 0, height: 0 };

  var height = fontData.height || 9;
  var falseVal = (format === 'string') ? '0' : false;
  var trueVal = (format === 'string') ? '1' : true;

  var lines = text.split('\n');
  var lineBitmaps = [];
  var maxWidth = 0;

  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) {
      // Empty line: push empty bitmap with just the font height
      lineBitmaps.push({ bitmap: [], width: 0, height: height });
      continue;
    }
    var lb = getLineBitmap(lines[i], fontData, options);
    lineBitmaps.push(lb);
    if (lb.width > maxWidth) maxWidth = lb.width;
  }

  if (maxWidth === 0) return { bitmap: [], width: 0, height: 0 };

  var lineGap = Math.max(2, Math.round(height * 0.15));
  var totalHeight = 0;
  var finalBitmap = [];

  for (var i = 0; i < lineBitmaps.length; i++) {
    var lb = lineBitmaps[i];
    var padLeft = 0;

    if (textAlign === 'center') {
      padLeft = Math.floor((maxWidth - lb.width) / 2);
    } else if (textAlign === 'right') {
      padLeft = maxWidth - lb.width;
    }
    var padRight = maxWidth - lb.width - padLeft;

    // If line has actual bitmap rows, pad them
    if (lb.bitmap.length > 0) {
      for (var y = 0; y < lb.bitmap.length; y++) {
        var row = [];
        for (var p = 0; p < padLeft; p++) row.push(falseVal);
        for (var x = 0; x < lb.bitmap[y].length; x++) row.push(lb.bitmap[y][x]);
        for (var p2 = 0; p2 < padRight; p2++) row.push(falseVal);
        finalBitmap.push(row);
      }
      totalHeight += lb.bitmap.length;
    } else {
      // Empty line: add empty rows for the font height
      for (var y = 0; y < height; y++) {
        var emptyRow = [];
        for (var x = 0; x < maxWidth; x++) emptyRow.push(falseVal);
        finalBitmap.push(emptyRow);
      }
      totalHeight += height;
    }

    // Line gap (not after last line)
    if (i < lineBitmaps.length - 1) {
      for (var g = 0; g < lineGap; g++) {
        var gapRow = [];
        for (var x = 0; x < maxWidth; x++) gapRow.push(falseVal);
        finalBitmap.push(gapRow);
      }
      totalHeight += lineGap;
    }
  }

  // Trim empty rows from top and bottom of composed bitmap.
  // Removes unused descent/accent rows when the text has no descenders/accents,
  // so the stitch count reflects actual ink, not font padding.
  while (finalBitmap.length > 0 && finalBitmap[0].indexOf(trueVal) === -1) {
    finalBitmap.shift();
  }
  while (finalBitmap.length > 0 && finalBitmap[finalBitmap.length - 1].indexOf(trueVal) === -1) {
    finalBitmap.pop();
  }
  totalHeight = finalBitmap.length;

  return { bitmap: finalBitmap, width: maxWidth, height: totalHeight };
}

function newEmptyCol(height, fillValue) {
  var col = new Array(height);
  for (var i = 0; i < height; i++) col[i] = fillValue;
  return col;
}
