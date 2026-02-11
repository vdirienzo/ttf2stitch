// ui-modules/bitmap.js — Bitmap functions (getEffectiveBitmap, getTextBitmap)

  // -- Bitmap --

  function getEffectiveBitmap(glyph) {
    if (!glyph || !glyph.bitmap || !glyph.bitmap.length) return [];
    var bitmap = glyph.bitmap;
    var lastFilledRow = -1;
    for (var r = bitmap.length - 1; r >= 0; r--) {
      if (bitmap[r].indexOf('1') !== -1) { lastFilledRow = r; break; }
    }
    if (lastFilledRow === -1) return bitmap.slice();
    return bitmap.slice(0, lastFilledRow + 1);
  }

  function getTextBitmap(text, fontData) {
    if (!text || !fontData || !fontData.glyphs) return { bitmap: [], width: 0, height: 0 };

    var height = fontData.height || 9;
    var letterSpacing = (fontData.letterSpacing != null) ? fontData.letterSpacing : 1;
    var spaceWidth = fontData.spaceWidth || 3;
    var columns = [];

    for (var ci = 0; ci < text.length; ci++) {
      var ch = text[ci];
      if (ci > 0 && letterSpacing > 0) {
        for (var s = 0; s < letterSpacing; s++) columns.push(new Array(height).fill(false));
      }
      if (ch === ' ') {
        for (var s2 = 0; s2 < spaceWidth; s2++) columns.push(new Array(height).fill(false));
        continue;
      }
      var glyph = fontData.glyphs[ch];
      if (!glyph || !glyph.bitmap || !glyph.bitmap.length) {
        for (var s3 = 0; s3 < spaceWidth; s3++) columns.push(new Array(height).fill(false));
        continue;
      }
      var bmp = glyph.bitmap;
      var glyphWidth = glyph.width || (bmp[0] ? bmp[0].length : 0);
      for (var x = 0; x < glyphWidth; x++) {
        var col = [];
        for (var y = 0; y < height; y++) {
          col.push(y < bmp.length && x < bmp[y].length && bmp[y][x] === '1');
        }
        columns.push(col);
      }
    }

    if (!columns.length) return { bitmap: [], width: 0, height: 0 };

    var width = columns.length;
    var bitmap = [];
    for (var y2 = 0; y2 < height; y2++) {
      var row = [];
      for (var x2 = 0; x2 < width; x2++) row.push(columns[x2][y2]);
      bitmap.push(row);
    }
    return { bitmap: bitmap, width: width, height: height };
  }
