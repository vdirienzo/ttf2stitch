// ══════════════════════════════════════════════════════════════════
//  Tests for pdf-engine.js pure functions
//  Run: node tests/test_pdf_engine.js
//  Self-contained: copies functions from pdf-engine.js (browser script, no exports)
// ══════════════════════════════════════════════════════════════════

'use strict';

const assert = require('assert');

// ── Global setup: simulate browser's `window` for pt() ──
global.window = {};

// ══════════════════════════════════════════════════════════════════
//  Copied pure functions from pdf-engine.js
// ══════════════════════════════════════════════════════════════════

function pt(key, fallback) {
  if (typeof window.t === 'function') {
    var val = window.t(key);
    if (val && val !== key) return val;
  }
  return fallback;
}

function getLuminance(color) {
  return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
}

function getTextBitmapForPDF(text, fontData) {
  if (!text || !fontData || !fontData.glyphs) return [];

  const glyphs = fontData.glyphs;
  const letterSpacing = fontData.letterSpacing ?? 1;
  const spaceWidth = fontData.spaceWidth ?? 3;

  const fontHeight = fontData.height || Math.max(
    1,
    ...Object.values(glyphs).map(g =>
      g.bitmap ? g.bitmap.length : 0
    )
  );

  const charColumns = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (i > 0 && letterSpacing > 0) {
      for (let s = 0; s < letterSpacing; s++) {
        const emptyCol = new Array(fontHeight).fill(false);
        charColumns.push(emptyCol);
      }
    }

    if (ch === ' ' || !glyphs[ch]) {
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

function calculatePDFLayout(width, height, cellSize, pageW, pageH) {
  const labelMarginLeft = 5;
  const labelMarginTop = 6;

  const availableW = pageW - labelMarginLeft;
  const availableH = pageH - labelMarginTop;

  const colsPerPage = Math.max(1, Math.floor(availableW / cellSize));
  const rowsPerPage = Math.max(1, Math.floor(availableH / cellSize));

  const pagesX = Math.max(1, Math.ceil(width / colsPerPage));
  const pagesY = Math.max(1, Math.ceil(height / rowsPerPage));

  return {
    colsPerPage,
    rowsPerPage,
    pagesX,
    pagesY,
    totalPages: pagesX * pagesY,
    labelMarginLeft,
    labelMarginTop,
  };
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}

// ══════════════════════════════════════════════════════════════════
//  Test fixtures — real cross-stitch domain data
// ══════════════════════════════════════════════════════════════════

const TEST_FONT = {
  name: "Test Font",
  id: "test-font",
  height: 4,
  letterSpacing: 1,
  spaceWidth: 3,
  glyphs: {
    'A': {
      width: 3,
      bitmap: [
        ['0', '1', '0'],
        ['1', '0', '1'],
        ['1', '1', '1'],
        ['1', '0', '1']
      ]
    },
    'I': {
      width: 1,
      bitmap: [
        ['1'],
        ['1'],
        ['1'],
        ['1']
      ]
    }
  }
};

// Real Aida counts and their cell sizes in mm
const AIDA_14_CELL_SIZE = 25.4 / 14;  // ~1.814 mm
const AIDA_16_CELL_SIZE = 25.4 / 16;  // ~1.5875 mm

// A4 page dimensions (mm)
const A4_PORTRAIT_W = 210;
const A4_PORTRAIT_H = 297;
const MARGIN = 15;
const HEADER_HEIGHT = 14;

// Usable area after margins and header
const USABLE_W = A4_PORTRAIT_W - MARGIN * 2;   // 180 mm
const USABLE_H = A4_PORTRAIT_H - MARGIN * 2 - HEADER_HEIGHT; // 253 mm

// ══════════════════════════════════════════════════════════════════
//  Test runner
// ══════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const failures = [];

function test(group, name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${group}: ${name}`);
  } catch (err) {
    failed++;
    const msg = err.message || String(err);
    failures.push(`${group}: ${name} - ${msg}`);
    console.log(`  \u2717 ${group}: ${name}`);
    console.log(`    ${msg}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'Value mismatch'} (expected ~${expected}, got ${actual})`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  getLuminance tests
// ══════════════════════════════════════════════════════════════════

console.log('\ngetLuminance');

test('getLuminance', 'black returns 0', () => {
  assert.strictEqual(getLuminance({ r: 0, g: 0, b: 0 }), 0);
});

test('getLuminance', 'white returns 1', () => {
  assert.strictEqual(getLuminance({ r: 255, g: 255, b: 255 }), 1);
});

test('getLuminance', 'pure red returns ~0.299', () => {
  assertClose(getLuminance({ r: 255, g: 0, b: 0 }), 0.299, 0.001, 'Red luminance');
});

test('getLuminance', 'pure green returns ~0.587', () => {
  assertClose(getLuminance({ r: 0, g: 255, b: 0 }), 0.587, 0.001, 'Green luminance');
});

test('getLuminance', 'pure blue returns ~0.114', () => {
  assertClose(getLuminance({ r: 0, g: 0, b: 255 }), 0.114, 0.001, 'Blue luminance');
});

test('getLuminance', 'DMC 321 Christmas Red {199,43,59} is dark (< 0.5)', () => {
  const lum = getLuminance({ r: 199, g: 43, b: 59 });
  assert.ok(lum < 0.5, `Expected < 0.5, got ${lum}`);
  // (0.299*199 + 0.587*43 + 0.114*59)/255 ≈ 0.3587
  assertClose(lum, 0.3587, 0.01, 'DMC 321 luminance');
});

test('getLuminance', 'DMC 310 Black {0,0,0} returns 0', () => {
  assert.strictEqual(getLuminance({ r: 0, g: 0, b: 0 }), 0);
});

test('getLuminance', 'DMC Blanc White {252,251,248} is bright (> 0.9)', () => {
  const lum = getLuminance({ r: 252, g: 251, b: 248 });
  assert.ok(lum > 0.9, `Expected > 0.9, got ${lum}`);
});

test('getLuminance', 'mid-gray {128,128,128} returns ~0.502', () => {
  assertClose(getLuminance({ r: 128, g: 128, b: 128 }), 128 / 255, 0.001, 'Mid-gray luminance');
});

// ══════════════════════════════════════════════════════════════════
//  getTextBitmapForPDF tests
// ══════════════════════════════════════════════════════════════════

console.log('\ngetTextBitmapForPDF');

test('getTextBitmapForPDF', '"A" produces 4 rows x 3 cols', () => {
  const bmp = getTextBitmapForPDF('A', TEST_FONT);
  assert.strictEqual(bmp.length, 4, `Expected 4 rows, got ${bmp.length}`);
  assert.strictEqual(bmp[0].length, 3, `Expected 3 cols, got ${bmp[0].length}`);
});

test('getTextBitmapForPDF', '"A" bitmap matches glyph pattern', () => {
  const bmp = getTextBitmapForPDF('A', TEST_FONT);
  // Row 0: [0,1,0] → [false, true, false]
  assert.deepStrictEqual(bmp[0], [false, true, false]);
  // Row 1: [1,0,1]
  assert.deepStrictEqual(bmp[1], [true, false, true]);
  // Row 2: [1,1,1]
  assert.deepStrictEqual(bmp[2], [true, true, true]);
  // Row 3: [1,0,1]
  assert.deepStrictEqual(bmp[3], [true, false, true]);
});

test('getTextBitmapForPDF', '"I" produces 4 rows x 1 col', () => {
  const bmp = getTextBitmapForPDF('I', TEST_FONT);
  assert.strictEqual(bmp.length, 4);
  assert.strictEqual(bmp[0].length, 1);
  // All true (solid vertical bar)
  for (let r = 0; r < 4; r++) {
    assert.strictEqual(bmp[r][0], true, `Row ${r} should be true`);
  }
});

test('getTextBitmapForPDF', '"AI" produces 4 rows x 5 cols (3 + 1 spacing + 1)', () => {
  const bmp = getTextBitmapForPDF('AI', TEST_FONT);
  assert.strictEqual(bmp.length, 4, `Expected 4 rows, got ${bmp.length}`);
  assert.strictEqual(bmp[0].length, 5, `Expected 5 cols, got ${bmp[0].length}`);
});

test('getTextBitmapForPDF', '"AI" spacing column is empty', () => {
  const bmp = getTextBitmapForPDF('AI', TEST_FONT);
  // Col 3 is the spacing column (between A width=3 and I)
  for (let r = 0; r < 4; r++) {
    assert.strictEqual(bmp[r][3], false, `Spacing col at row ${r} should be false`);
  }
});

test('getTextBitmapForPDF', '"AI" last column is all true (I glyph)', () => {
  const bmp = getTextBitmapForPDF('AI', TEST_FONT);
  for (let r = 0; r < 4; r++) {
    assert.strictEqual(bmp[r][4], true, `I glyph col at row ${r} should be true`);
  }
});

test('getTextBitmapForPDF', 'space produces 4 rows x 3 cols, all false', () => {
  const bmp = getTextBitmapForPDF(' ', TEST_FONT);
  assert.strictEqual(bmp.length, 4, `Expected 4 rows, got ${bmp.length}`);
  assert.strictEqual(bmp[0].length, 3, `Expected 3 cols (spaceWidth), got ${bmp[0].length}`);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      assert.strictEqual(bmp[r][c], false, `Cell [${r}][${c}] should be false`);
    }
  }
});

test('getTextBitmapForPDF', 'empty string returns []', () => {
  const bmp = getTextBitmapForPDF('', TEST_FONT);
  assert.deepStrictEqual(bmp, []);
});

test('getTextBitmapForPDF', 'null text returns []', () => {
  const bmp = getTextBitmapForPDF(null, TEST_FONT);
  assert.deepStrictEqual(bmp, []);
});

test('getTextBitmapForPDF', 'null fontData returns []', () => {
  const bmp = getTextBitmapForPDF('A', null);
  assert.deepStrictEqual(bmp, []);
});

test('getTextBitmapForPDF', 'fontData with no glyphs returns []', () => {
  const bmp = getTextBitmapForPDF('A', { height: 4 });
  assert.deepStrictEqual(bmp, []);
});

test('getTextBitmapForPDF', 'missing glyph "X" treated as space (4 rows x 3 cols, all false)', () => {
  const bmp = getTextBitmapForPDF('X', TEST_FONT);
  assert.strictEqual(bmp.length, 4, `Expected 4 rows, got ${bmp.length}`);
  assert.strictEqual(bmp[0].length, 3, `Expected 3 cols (spaceWidth), got ${bmp[0].length}`);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      assert.strictEqual(bmp[r][c], false, `Cell [${r}][${c}] should be false`);
    }
  }
});

test('getTextBitmapForPDF', '"A I" includes spacing + space + spacing correctly', () => {
  // 'A'(3) + spacing(1) + space(3) + spacing(1) + 'I'(1) = 9 cols
  const bmp = getTextBitmapForPDF('A I', TEST_FONT);
  assert.strictEqual(bmp.length, 4);
  assert.strictEqual(bmp[0].length, 9, `Expected 9 cols, got ${bmp[0].length}`);
});

test('getTextBitmapForPDF', 'letterSpacing=0 font has no gap between glyphs', () => {
  const noSpacingFont = {
    ...TEST_FONT,
    letterSpacing: 0,
  };
  // 'AI' → 3 + 0 + 1 = 4 cols
  const bmp = getTextBitmapForPDF('AI', noSpacingFont);
  assert.strictEqual(bmp[0].length, 4, `Expected 4 cols with no spacing, got ${bmp[0].length}`);
});

test('getTextBitmapForPDF', 'height inferred from glyphs if not set', () => {
  const noHeightFont = {
    glyphs: TEST_FONT.glyphs,
    letterSpacing: 1,
    spaceWidth: 3,
  };
  const bmp = getTextBitmapForPDF('A', noHeightFont);
  assert.strictEqual(bmp.length, 4, 'Should infer height=4 from glyph bitmaps');
});

// ══════════════════════════════════════════════════════════════════
//  calculatePDFLayout tests
// ══════════════════════════════════════════════════════════════════

console.log('\ncalculatePDFLayout');

test('calculatePDFLayout', 'returns labelMarginLeft=5 and labelMarginTop=6', () => {
  const layout = calculatePDFLayout(10, 4, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.strictEqual(layout.labelMarginLeft, 5);
  assert.strictEqual(layout.labelMarginTop, 6);
});

test('calculatePDFLayout', 'small pattern (10x4) at Aida 14 fits on 1 page', () => {
  const layout = calculatePDFLayout(10, 4, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.strictEqual(layout.totalPages, 1);
  assert.strictEqual(layout.pagesX, 1);
  assert.strictEqual(layout.pagesY, 1);
});

test('calculatePDFLayout', 'small pattern colsPerPage and rowsPerPage are correct', () => {
  const layout = calculatePDFLayout(10, 4, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  // availableW = 180 - 5 = 175, colsPerPage = floor(175 / 1.814...) = 96
  // availableH = 253 - 6 = 247, rowsPerPage = floor(247 / 1.814...) = 136
  const expectedCols = Math.floor((USABLE_W - 5) / AIDA_14_CELL_SIZE);
  const expectedRows = Math.floor((USABLE_H - 6) / AIDA_14_CELL_SIZE);
  assert.strictEqual(layout.colsPerPage, expectedCols);
  assert.strictEqual(layout.rowsPerPage, expectedRows);
});

test('calculatePDFLayout', 'large pattern (200x100) at Aida 14 requires multiple pages', () => {
  const layout = calculatePDFLayout(200, 100, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.ok(layout.totalPages > 1, `Expected > 1 page, got ${layout.totalPages}`);
  // colsPerPage = 94, pagesX = ceil(200/94) = 3
  assert.strictEqual(layout.pagesX, 3);
  // rowsPerPage = 136, pagesY = ceil(100/136) = 1
  assert.strictEqual(layout.pagesY, 1);
  assert.strictEqual(layout.totalPages, 3);
});

test('calculatePDFLayout', 'very large pattern requires pages in both axes', () => {
  const layout = calculatePDFLayout(300, 300, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.ok(layout.pagesX > 1, `Expected pagesX > 1, got ${layout.pagesX}`);
  assert.ok(layout.pagesY > 1, `Expected pagesY > 1, got ${layout.pagesY}`);
  assert.strictEqual(layout.totalPages, layout.pagesX * layout.pagesY);
});

test('calculatePDFLayout', 'single cell always fits on 1 page', () => {
  const layout = calculatePDFLayout(1, 1, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.strictEqual(layout.totalPages, 1);
});

test('calculatePDFLayout', 'Aida 16 has smaller cells, more fit per page', () => {
  const layout14 = calculatePDFLayout(200, 100, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  const layout16 = calculatePDFLayout(200, 100, AIDA_16_CELL_SIZE, USABLE_W, USABLE_H);
  assert.ok(layout16.colsPerPage > layout14.colsPerPage,
    `Aida 16 colsPerPage (${layout16.colsPerPage}) should > Aida 14 (${layout14.colsPerPage})`);
  assert.ok(layout16.totalPages <= layout14.totalPages,
    `Aida 16 pages (${layout16.totalPages}) should <= Aida 14 (${layout14.totalPages})`);
});

test('calculatePDFLayout', 'landscape orientation (wider page) fits more columns', () => {
  const portraitW = A4_PORTRAIT_W - MARGIN * 2;           // 180
  const portraitH = A4_PORTRAIT_H - MARGIN * 2 - HEADER_HEIGHT; // 253
  const landscapeW = A4_PORTRAIT_H - MARGIN * 2;          // 267
  const landscapeH = A4_PORTRAIT_W - MARGIN * 2 - HEADER_HEIGHT; // 166

  const portrait = calculatePDFLayout(200, 100, AIDA_14_CELL_SIZE, portraitW, portraitH);
  const landscape = calculatePDFLayout(200, 100, AIDA_14_CELL_SIZE, landscapeW, landscapeH);

  assert.ok(landscape.colsPerPage > portrait.colsPerPage,
    `Landscape cols (${landscape.colsPerPage}) should > portrait (${portrait.colsPerPage})`);
});

test('calculatePDFLayout', 'minimum 1 col and 1 row per page even with huge cellSize', () => {
  const layout = calculatePDFLayout(5, 5, 999, 10, 10);
  assert.strictEqual(layout.colsPerPage, 1);
  assert.strictEqual(layout.rowsPerPage, 1);
});

// ══════════════════════════════════════════════════════════════════
//  truncate tests
// ══════════════════════════════════════════════════════════════════

console.log('\ntruncate');

test('truncate', 'short string unchanged', () => {
  assert.strictEqual(truncate('Hello', 10), 'Hello');
});

test('truncate', 'exact length unchanged', () => {
  assert.strictEqual(truncate('Hello', 5), 'Hello');
});

test('truncate', 'long string truncated with ellipsis', () => {
  assert.strictEqual(truncate('Hello World', 5), 'Hell\u2026');
});

test('truncate', 'empty string returns empty', () => {
  assert.strictEqual(truncate('', 5), '');
});

test('truncate', 'null returns empty', () => {
  assert.strictEqual(truncate(null, 5), '');
});

test('truncate', 'undefined returns empty', () => {
  assert.strictEqual(truncate(undefined, 5), '');
});

test('truncate', 'maxLen=1 returns single ellipsis char', () => {
  assert.strictEqual(truncate('Hello World', 1), '\u2026');
});

test('truncate', 'single char with maxLen=1 unchanged', () => {
  assert.strictEqual(truncate('H', 1), 'H');
});

test('truncate', 'real PDF usage: long pattern text at 25 chars', () => {
  const longText = 'Merry Christmas and Happy New Year';
  const result = truncate(longText, 25);
  assert.strictEqual(result.length, 25);
  assert.ok(result.endsWith('\u2026'), 'Should end with ellipsis');
});

// ══════════════════════════════════════════════════════════════════
//  pt (translation fallback) tests
// ══════════════════════════════════════════════════════════════════

console.log('\npt');

test('pt', 'returns fallback when window.t is undefined', () => {
  delete window.t;
  assert.strictEqual(pt('pdf_title', 'Pattern'), 'Pattern');
});

test('pt', 'returns translation when window.t provides one', () => {
  window.t = (key) => {
    const translations = { 'pdf_title': 'Patron' };
    return translations[key] || key;
  };
  assert.strictEqual(pt('pdf_title', 'Pattern'), 'Patron');
});

test('pt', 'returns fallback when window.t returns the key unchanged', () => {
  window.t = (key) => key; // no translation found, returns key as-is
  assert.strictEqual(pt('pdf_missing_key', 'Default Text'), 'Default Text');
});

test('pt', 'returns fallback when window.t returns empty string', () => {
  window.t = () => '';
  assert.strictEqual(pt('pdf_title', 'Pattern'), 'Pattern');
});

test('pt', 'returns fallback when window.t returns null', () => {
  window.t = () => null;
  assert.strictEqual(pt('pdf_title', 'Pattern'), 'Pattern');
});

test('pt', 'returns fallback when window.t is not a function', () => {
  window.t = 'not a function';
  assert.strictEqual(pt('pdf_title', 'Pattern'), 'Pattern');
});

test('pt', 'uses real PDF i18n keys correctly', () => {
  window.t = (key) => {
    const translations = {
      'pdf_thread_legend': 'Leyenda de Hilos',
      'pdf_pattern_info': 'Info del Patron',
      'pdf_scale_verify': 'Verificar escala',
    };
    return translations[key] || key;
  };
  assert.strictEqual(pt('pdf_thread_legend', 'Thread Legend'), 'Leyenda de Hilos');
  assert.strictEqual(pt('pdf_pattern_info', 'Pattern Information'), 'Info del Patron');
  // Key not in translations → returns key → pt falls back
  assert.strictEqual(pt('pdf_unknown_key', 'Fallback'), 'Fallback');
});

// Clean up
delete window.t;

// ══════════════════════════════════════════════════════════════════
//  Integration: bitmap + layout together
// ══════════════════════════════════════════════════════════════════

console.log('\nIntegration');

test('Integration', 'bitmap of "AI" feeds correctly into layout calculation', () => {
  const bmp = getTextBitmapForPDF('AI', TEST_FONT);
  const w = bmp[0].length; // 5
  const h = bmp.length;     // 4
  const layout = calculatePDFLayout(w, h, AIDA_14_CELL_SIZE, USABLE_W, USABLE_H);
  assert.strictEqual(layout.totalPages, 1, 'Tiny "AI" pattern should fit on 1 page');
});

test('Integration', 'stitch count from bitmap is correct', () => {
  const bmp = getTextBitmapForPDF('A', TEST_FONT);
  let stitchCount = 0;
  for (const row of bmp) {
    for (const cell of row) {
      if (cell) stitchCount++;
    }
  }
  // A glyph: row0=1, row1=2, row2=3, row3=2 → total=8
  assert.strictEqual(stitchCount, 8, `Expected 8 filled stitches in 'A', got ${stitchCount}`);
});

test('Integration', 'luminance determines symbol color for dark thread', () => {
  const dmcRed = { r: 199, g: 43, b: 59 };
  const lum = getLuminance(dmcRed);
  const symbolIsWhite = lum < 0.5;
  assert.strictEqual(symbolIsWhite, true, 'DMC 321 is dark, symbol should be white');
});

test('Integration', 'luminance determines symbol color for light thread', () => {
  const dmcWhite = { r: 252, g: 251, b: 248 };
  const lum = getLuminance(dmcWhite);
  const symbolIsWhite = lum < 0.5;
  assert.strictEqual(symbolIsWhite, false, 'DMC Blanc is light, symbol should be black');
});

// ══════════════════════════════════════════════════════════════════
//  Summary
// ══════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(55));
const total = passed + failed;
if (failed === 0) {
  console.log(`  ALL TESTS PASSED: ${passed}/${total}`);
} else {
  console.log(`  FAILED: ${failed}/${total} tests failed`);
  console.log('');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log('='.repeat(55) + '\n');

process.exit(failed > 0 ? 1 : 0);
