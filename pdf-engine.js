// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Generation Engine
//  Generates cross-stitch pattern PDFs from bitmap font data
//  Depends on jsPDF loaded via CDN (window.jspdf.jsPDF)
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
      const w = ch === ' ' ? spaceWidth : spaceWidth;
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

/**
 * Calculate multi-page layout for the pattern grid.
 *
 * @param {number} width - Total bitmap width in cells
 * @param {number} height - Total bitmap height in cells
 * @param {number} cellSize - Cell size in mm
 * @param {number} pageW - Usable page width in mm
 * @param {number} pageH - Usable page height in mm
 * @returns {object} Layout info: colsPerPage, rowsPerPage, pagesX, pagesY, totalPages
 */
function calculatePDFLayout(width, height, cellSize, pageW, pageH) {
  // Reserve space for coordinate labels on left (~8mm) and top (~6mm)
  const labelMarginLeft = 8;
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

/**
 * Draw one page section of the pattern grid.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {boolean[][]} bitmap - Full 2D bitmap
 * @param {object} color - { r, g, b } thread color
 * @param {number} startCol - First column index for this page
 * @param {number} startRow - First row index for this page
 * @param {number} colsPerPage - Max columns that fit on one page
 * @param {number} rowsPerPage - Max rows that fit on one page
 * @param {number} cellSize - Cell size in mm
 * @param {object} margins - { left, top } in mm
 * @param {object} layout - Layout info from calculatePDFLayout
 */
function drawGridPage(pdf, bitmap, color, startCol, startRow, colsPerPage, rowsPerPage, cellSize, margins, layout) {
  const totalWidth = bitmap[0] ? bitmap[0].length : 0;
  const totalHeight = bitmap.length;

  // How many cells to actually draw on this page
  const endCol = Math.min(startCol + colsPerPage, totalWidth);
  const endRow = Math.min(startRow + rowsPerPage, totalHeight);
  const drawCols = endCol - startCol;
  const drawRows = endRow - startRow;

  const offsetX = margins.left + layout.labelMarginLeft;
  const offsetY = margins.top + layout.labelMarginTop;

  // Determine symbol color based on luminance
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
  const symbolIsWhite = luminance < 0.5;

  // 1. Draw filled cells
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      if (bitmap[row] && bitmap[row][col]) {
        const x = offsetX + (col - startCol) * cellSize;
        const y = offsetY + (row - startRow) * cellSize;

        // Fill cell with thread color
        pdf.setFillColor(color.r, color.g, color.b);
        pdf.rect(x, y, cellSize, cellSize, 'F');

        // Draw cross symbol centered in cell (only if cell is large enough to be readable)
        if (cellSize >= 1.5) {
          if (symbolIsWhite) {
            pdf.setTextColor(255, 255, 255);
          } else {
            pdf.setTextColor(0, 0, 0);
          }
          pdf.setFontSize(Math.max(4, cellSize * 2.2));
          pdf.text(
            '\u00D7',
            x + cellSize / 2,
            y + cellSize / 2 + cellSize * 0.12,
            { align: 'center' }
          );
        }
      }
    }
  }

  // 2. Draw grid lines

  // Thin grid lines (every cell)
  pdf.setDrawColor(204, 204, 204); // #ccc
  pdf.setLineWidth(0.1);

  for (let col = 0; col <= drawCols; col++) {
    const x = offsetX + col * cellSize;
    pdf.line(x, offsetY, x, offsetY + drawRows * cellSize);
  }
  for (let row = 0; row <= drawRows; row++) {
    const y = offsetY + row * cellSize;
    pdf.line(offsetX, y, offsetX + drawCols * cellSize, y);
  }

  // Bold grid lines (every 10 cells)
  pdf.setDrawColor(51, 51, 51); // #333
  pdf.setLineWidth(0.3);

  for (let col = 0; col <= drawCols; col++) {
    const absCol = startCol + col;
    if (absCol % 10 === 0) {
      const x = offsetX + col * cellSize;
      pdf.line(x, offsetY, x, offsetY + drawRows * cellSize);
    }
  }
  for (let row = 0; row <= drawRows; row++) {
    const absRow = startRow + row;
    if (absRow % 10 === 0) {
      const y = offsetY + row * cellSize;
      pdf.line(offsetX, y, offsetX + drawCols * cellSize, y);
    }
  }

  // Bold border around the grid area
  pdf.setDrawColor(51, 51, 51);
  pdf.setLineWidth(0.3);
  pdf.rect(offsetX, offsetY, drawCols * cellSize, drawRows * cellSize, 'S');

  // 3. Coordinate labels every 10 cells

  pdf.setFontSize(5);
  pdf.setTextColor(120, 120, 120);

  // Top edge labels
  for (let col = 0; col <= drawCols; col++) {
    const absCol = startCol + col;
    if (absCol % 10 === 0 && absCol > 0) {
      const x = offsetX + col * cellSize;
      pdf.text(String(absCol), x, offsetY - 1, { align: 'center' });
    }
  }

  // Left edge labels
  for (let row = 0; row <= drawRows; row++) {
    const absRow = startRow + row;
    if (absRow % 10 === 0 && absRow > 0) {
      const y = offsetY + row * cellSize + 0.3;
      pdf.text(String(absRow), offsetX - 1.5, y, { align: 'right' });
    }
  }

  // 4. Verification scale bar (1:1 print check)
  // Draw a 10mm bar at bottom-right so users can verify print scale with a ruler
  const gridBottom = offsetY + drawRows * cellSize;
  const gridRight = offsetX + drawCols * cellSize;
  const barLen = 10; // exactly 10mm
  const barY = gridBottom + 5;
  const barX = gridRight - barLen;

  // Bar line
  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.4);
  pdf.line(barX, barY, barX + barLen, barY);
  // End ticks
  pdf.line(barX, barY - 1.5, barX, barY + 1.5);
  pdf.line(barX + barLen, barY - 1.5, barX + barLen, barY + 1.5);
  // Label
  pdf.setFontSize(5.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('\u2190 10 mm \u2192', barX + barLen / 2, barY - 2.5, { align: 'center' });
  pdf.setFontSize(4.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(140, 130, 120);
  pdf.text('Verify: measure this bar with a ruler. Must be exactly 10 mm.', barX + barLen / 2, barY + 3.5, { align: 'center' });
}

/**
 * Draw the legend/materials page.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} color - { code, name, hex, r, g, b }
 * @param {number} stitchCount - Total filled stitches
 * @param {number} aidaCount - Fabric count (11, 14, 16, 18)
 * @param {number} width - Pattern width in stitches
 * @param {number} height - Pattern height in stitches
 * @param {string} fontName - Name of the font used
 */
function drawLegend(pdf, color, stitchCount, aidaCount, width, height, fontName, text, pageNum, totalPages, pageW, pageH) {
  const margin = 15;
  pageW = pageW || 210;
  pageH = pageH || 297;

  // Branded header + footer
  drawBrandedHeader(pdf, text || '', fontName, width, height, pageNum, totalPages, margin, pageW);
  drawBrandedFooter(pdf, margin, pageW, pageH);

  let y = margin + 18; // after branded header bar

  // Title
  pdf.setFontSize(16);
  pdf.setTextColor(184, 58, 42); // accent color
  pdf.setFont('helvetica', 'bold');
  pdf.text('Thread Legend', margin, y);
  pdf.setFontSize(10);
  pdf.setTextColor(120, 120, 120);
  pdf.setFont('helvetica', 'normal');
  pdf.text(' / Leyenda de Hilos', margin + 42, y);
  y += 10;

  // Thread calculation: ~0.013m per full cross stitch at Aida 14
  // (4 diagonal passes × stitch_size × √2 + 20% waste), scaled by fabric count
  const metersPerStitch = 0.013 * (14 / aidaCount);
  const meters = stitchCount * metersPerStitch;
  const skeins = Math.ceil(meters / 8);

  // Table width adapts to page
  const contentW = pageW - margin * 2;
  const tW = Math.min(contentW, 220);
  const colPcts = [0, 0.10, 0.19, 0.31, 0.52, 0.68, 0.84];
  const colX = colPcts.map(function(p) { return margin + p * tW; });
  const colLabels = ['Symbol', 'Swatch', 'DMC Code', 'Color Name', 'Stitches', 'Thread', 'Skeins'];

  // Table header
  pdf.setFillColor(245, 240, 235);
  pdf.rect(margin, y - 3, tW, 8, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.setFont('helvetica', 'bold');
  for (let i = 0; i < colLabels.length; i++) {
    pdf.text(colLabels[i], colX[i] + 1, y + 2);
  }
  y += 10;

  // Header line
  pdf.setDrawColor(200, 190, 175);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y - 2, margin + tW, y - 2);

  // Data row
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;

  // Symbol cell
  pdf.setFillColor(color.r, color.g, color.b);
  pdf.rect(colX[0] + 1, y - 2, 10, 7, 'F');
  pdf.setTextColor(luminance < 0.5 ? 255 : 0, luminance < 0.5 ? 255 : 0, luminance < 0.5 ? 255 : 0);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('\u00D7', colX[0] + 6, y + 3, { align: 'center' });

  // Color swatch
  pdf.setFillColor(color.r, color.g, color.b);
  pdf.rect(colX[1] + 1, y - 2, 14, 7, 'F');
  pdf.setDrawColor(180, 170, 160);
  pdf.setLineWidth(0.15);
  pdf.rect(colX[1] + 1, y - 2, 14, 7, 'S');

  // Text values
  pdf.setTextColor(60, 60, 60);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('DMC ' + color.code, colX[2] + 1, y + 2.5);
  pdf.text(color.name || '', colX[3] + 1, y + 2.5);
  pdf.text(String(stitchCount), colX[4] + 1, y + 2.5);
  pdf.text(meters.toFixed(2) + ' m', colX[5] + 1, y + 2.5);
  pdf.text(String(skeins), colX[6] + 1, y + 2.5);
  y += 12;

  // Bottom line
  pdf.setDrawColor(200, 190, 175);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y - 3, margin + tW, y - 3);
  y += 8;

  // ── Pattern Information ──
  pdf.setFontSize(13);
  pdf.setTextColor(184, 58, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Pattern Information', margin, y);
  y += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(70, 70, 70);

  const stitchMm = (25.4 / aidaCount).toFixed(2);
  const inchesW = (width / aidaCount).toFixed(2);
  const inchesH = (height / aidaCount).toFixed(2);
  const cmW = (width / aidaCount * 2.54).toFixed(1);
  const cmH = (height / aidaCount * 2.54).toFixed(1);

  const notes = [
    'Use 2 strands of DMC thread for cross stitches',
    'Start from the center of the fabric for best results',
    'Fabric: Aida ' + aidaCount.toFixed(1) + ' ct \u2014 Each stitch = ' + stitchMm + ' mm',
    'Pattern size: ' + width + ' \u00D7 ' + height + ' stitches',
    'Finished size: ' + cmW + ' \u00D7 ' + cmH + ' cm (' + inchesW + ' \u00D7 ' + inchesH + '")',
    'Total crosses: ' + stitchCount,
    'Thread required: ' + meters.toFixed(2) + ' m (' + skeins + ' skein' + (skeins !== 1 ? 's' : '') + ')',
    '\u26a0 Print at 100% scale (no fit-to-page) for 1:1 stitch size',
  ];

  for (const note of notes) {
    pdf.text('\u2022  ' + note, margin + 2, y);
    y += 5.8;
  }
  y += 6;

  // ── Finished Size / Cut Fabric boxes ──
  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.4);
  pdf.setFillColor(253, 248, 244);
  const boxW = Math.min(tW / 2 - 4, 90);

  // Finished Size box
  pdf.rect(margin, y, boxW, 22, 'FD');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Finished Size', margin + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  pdf.text(cmW + ' \u00D7 ' + cmH + ' cm', margin + 4, y + 13);
  pdf.setFontSize(8);
  pdf.setTextColor(140, 130, 120);
  pdf.text('(' + inchesW + ' \u00D7 ' + inchesH + '")', margin + 4, y + 18);

  // Cut Fabric box (add 3" margin each side)
  const cutX = margin + boxW + 8;
  pdf.setDrawColor(184, 58, 42);
  pdf.setFillColor(253, 248, 244);
  pdf.rect(cutX, y, boxW, 22, 'FD');
  const cutInW = (parseFloat(inchesW) + 6).toFixed(1);
  const cutInH = (parseFloat(inchesH) + 6).toFixed(1);
  const cutCmW = (cutInW * 2.54).toFixed(1);
  const cutCmH = (cutInH * 2.54).toFixed(1);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Cut Fabric', cutX + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  pdf.text(cutCmW + ' \u00D7 ' + cutCmH + ' cm', cutX + 4, y + 13);
  pdf.setFontSize(8);
  pdf.setTextColor(140, 130, 120);
  pdf.text('(+3" margin each side)', cutX + 4, y + 18);

}

/**
 * Draw branded header bar on a PDF page.
 * Crimson accent bar + logo text + pattern info + page number.
 */
function drawBrandedHeader(pdf, text, fontName, patternWidth, patternHeight, pageNum, totalPages, margin, pageW) {
  const barY = margin - 2;
  const barH = 12;

  // Accent bar background
  pdf.setFillColor(184, 58, 42); // var(--accent) #b83a2a
  pdf.rect(margin, barY, pageW - margin * 2, barH, 'F');

  // Logo: ✕ Word2Stitch
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text('\u2715 Word2Stitch', margin + 3, barY + 5);

  // Pattern description
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(255, 230, 225);
  const desc = '"' + truncate(text, 25) + '" \u00B7 ' + fontName + ' \u00B7 ' +
    patternWidth + '\u00D7' + patternHeight;
  pdf.text(desc, margin + 3, barY + 9.5);

  // Page number (right-aligned)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text(pageNum + ' / ' + totalPages, pageW - margin - 3, barY + 7, { align: 'right' });
}

/**
 * Draw branded footer on a PDF page.
 * Thin accent line + branding text + date.
 */
function drawBrandedFooter(pdf, margin, pageW, pageH) {
  const footerY = pageH - margin + 2;

  // Accent line
  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.5);
  pdf.line(margin, footerY, pageW - margin, footerY);

  // Left: branding
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(184, 58, 42);
  pdf.text('\u2715 Word2Stitch \u2014 Cross-Stitch Pattern Generator', margin, footerY + 4);

  // Right: date
  pdf.setTextColor(160, 150, 140);
  var now = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  pdf.text(dateStr, pageW - margin, footerY + 4, { align: 'right' });
}

/**
 * Build the PDF document with given orientation.
 * Returns { pdf, filename } without saving.
 */
function buildPDF(text, fontData, dmcColor, aidaCount, orientation) {
  const bitmap = getTextBitmapForPDF(text, fontData);
  if (bitmap.length === 0 || !bitmap[0] || bitmap[0].length === 0) {
    return null;
  }

  const patternWidth = bitmap[0].length;
  const patternHeight = bitmap.length;

  let stitchCount = 0;
  for (let row = 0; row < patternHeight; row++) {
    for (let col = 0; col < patternWidth; col++) {
      if (bitmap[row][col]) stitchCount++;
    }
  }

  const isLandscape = orientation === 'landscape';
  const pageW = isLandscape ? 297 : 210;
  const pageH = isLandscape ? 210 : 297;
  const margin = 15;
  const headerHeight = 14;
  // 1:1 scale: cellSize = real stitch size in mm = 25.4 / aidaCount
  const cellSize = 25.4 / aidaCount;

  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerHeight;

  const layout = calculatePDFLayout(patternWidth, patternHeight, cellSize, usableW, usableH);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totalGridPages = layout.totalPages;
  const totalPagesWithLegend = totalGridPages + 1;
  const fontName = fontData.name || fontData.id || 'Unknown';

  let pageNum = 0;
  for (let pageY = 0; pageY < layout.pagesY; pageY++) {
    for (let pageX = 0; pageX < layout.pagesX; pageX++) {
      if (pageNum > 0) {
        pdf.addPage();
      }
      pageNum++;

      const startCol = pageX * layout.colsPerPage;
      const startRow = pageY * layout.rowsPerPage;

      drawBrandedHeader(pdf, text, fontName, patternWidth, patternHeight, pageNum, totalPagesWithLegend, margin, pageW);
      drawBrandedFooter(pdf, margin, pageW, pageH);

      drawGridPage(
        pdf,
        bitmap,
        { r: dmcColor.r, g: dmcColor.g, b: dmcColor.b },
        startCol,
        startRow,
        layout.colsPerPage,
        layout.rowsPerPage,
        cellSize,
        { left: margin, top: margin + headerHeight },
        layout
      );
    }
  }

  pdf.addPage();
  drawLegend(pdf, dmcColor, stitchCount, aidaCount, patternWidth, patternHeight, fontName, text, totalPagesWithLegend, totalPagesWithLegend, pageW, pageH);

  const safeText = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40);
  const safeId = (fontData.id || 'font').replace(/[^a-z0-9-]/g, '');
  const filename = 'word2stitch-' + (safeText || 'pattern') + '-' + safeId + '.pdf';

  return { pdf, filename, pages: totalPagesWithLegend, stitches: stitchCount, patternWidth, patternHeight };
}

/**
 * Create and show the print preview modal.
 */
function _createPrintModal() {
  if (document.getElementById('printModal')) return;

  var modal = document.createElement('div');
  modal.id = 'printModal';
  modal.innerHTML = [
    '<div class="pm-backdrop"></div>',
    '<div class="pm-dialog">',
    '  <div class="pm-header">',
    '    <span class="pm-title">\u2715 Print Preview</span>',
    '    <button class="pm-close" id="pmClose">\u2715</button>',
    '  </div>',
    '  <div class="pm-orient-row">',
    '    <button class="pm-orient-btn pm-active" data-orient="portrait">',
    '      <svg viewBox="0 0 24 32" width="20" height="26"><rect x="1" y="1" width="22" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="5" y1="8" x2="19" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>',
    '      Portrait',
    '    </button>',
    '    <button class="pm-orient-btn" data-orient="landscape">',
    '      <svg viewBox="0 0 32 24" width="26" height="20"><rect x="1" y="1" width="30" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="5" y1="6" x2="27" y2="6" stroke="currentColor" stroke-width="1.5"/></svg>',
    '      Landscape',
    '    </button>',
    '  </div>',
    '  <div class="pm-preview">',
    '    <iframe id="pmIframe" class="pm-iframe"></iframe>',
    '  </div>',
    '  <div class="pm-info" id="pmInfo"></div>',
    '  <div class="pm-actions">',
    '    <button class="pm-btn pm-btn-secondary" id="pmDownload">',
    '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    '      Download PDF',
    '    </button>',
    '    <button class="pm-btn pm-btn-primary" id="pmPrint">',
    '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    '      Print',
    '    </button>',
    '  </div>',
    '</div>',
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = [
    '#printModal { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; }',
    '#printModal.pm-hidden { display:none; }',
    '.pm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.5); }',
    '.pm-dialog { position:relative; background:#faf8f5; border-radius:14px; width:90vw; max-width:680px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3); overflow:hidden; }',
    '.pm-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #e0d6c8; }',
    '.pm-title { font-family:"DM Serif Display",Georgia,serif; font-size:18px; color:#3d3229; }',
    '.pm-close { background:none; border:none; font-size:18px; color:#a99e8f; cursor:pointer; padding:4px 8px; border-radius:6px; transition:all 0.15s; }',
    '.pm-close:hover { background:rgba(184,58,42,0.08); color:#b83a2a; }',
    '.pm-orient-row { display:flex; gap:8px; padding:12px 18px; justify-content:center; }',
    '.pm-orient-btn { display:flex; align-items:center; gap:8px; padding:10px 20px; border:2px solid #e0d6c8; border-radius:10px; background:#fff; cursor:pointer; font-family:"Anybody",system-ui,sans-serif; font-size:13px; font-weight:600; color:#7a6e60; transition:all 0.15s; min-height:48px; }',
    '.pm-orient-btn:hover { border-color:#b83a2a; color:#b83a2a; }',
    '.pm-orient-btn.pm-active { border-color:#b83a2a; background:rgba(184,58,42,0.08); color:#b83a2a; }',
    '.pm-preview { flex:1; min-height:0; padding:0 18px; overflow:hidden; }',
    '.pm-iframe { width:100%; height:350px; border:1px solid #e0d6c8; border-radius:8px; background:#fff; }',
    '.pm-info { padding:8px 18px; font-size:12px; color:#7a6e60; text-align:center; }',
    '.pm-actions { display:flex; gap:10px; padding:14px 18px; border-top:1px solid #e0d6c8; justify-content:flex-end; }',
    '.pm-btn { display:flex; align-items:center; gap:6px; padding:10px 20px; border-radius:10px; font-family:"Anybody",system-ui,sans-serif; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:all 0.15s; min-height:48px; }',
    '.pm-btn-secondary { background:#fff; color:#3d3229; border:2px solid #e0d6c8; }',
    '.pm-btn-secondary:hover { border-color:#b83a2a; color:#b83a2a; }',
    '.pm-btn-primary { background:#b83a2a; color:#fff; }',
    '.pm-btn-primary:hover { background:#9c3023; box-shadow:0 3px 12px rgba(184,58,42,0.25); }',
    '@media(max-width:640px) { .pm-dialog { width:96vw; max-height:95vh; border-radius:10px; } .pm-iframe { height:280px; } .pm-orient-btn { padding:8px 14px; font-size:12px; } .pm-actions { flex-direction:column; } .pm-btn { justify-content:center; } }',
  ].join('\n');

  document.head.appendChild(style);
  document.body.appendChild(modal);
}

/**
 * Show the print preview modal.
 * Generates PDF in chosen orientation and displays in iframe.
 */
function generatePDF(text, fontData, dmcColor, aidaCount) {
  if (!text || !text.trim()) { alert('Please enter some text.'); return; }
  if (!fontData || !fontData.glyphs) { alert('No font selected.'); return; }
  if (!dmcColor) { alert('No color selected.'); return; }

  _createPrintModal();

  var modal = document.getElementById('printModal');
  var iframe = document.getElementById('pmIframe');
  var info = document.getElementById('pmInfo');
  var currentOrientation = 'portrait';
  var currentBlobUrl = null;

  function buildAndShow(orient) {
    var result = buildPDF(text, fontData, dmcColor, aidaCount, orient);
    if (!result) { alert('Could not render pattern.'); return; }

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    var blob = result.pdf.output('blob');
    currentBlobUrl = URL.createObjectURL(blob);

    iframe.src = currentBlobUrl;

    var cmW = (result.patternWidth / aidaCount * 2.54).toFixed(1);
    var cmH = (result.patternHeight / aidaCount * 2.54).toFixed(1);
    info.textContent = result.patternWidth + '\u00d7' + result.patternHeight +
      ' stitches \u00b7 ' + cmW + ' \u00d7 ' + cmH + ' cm \u00b7 ' +
      result.pages + ' pages \u00b7 ' + result.stitches + ' crosses';

    // Store for download/print
    modal._pdfResult = result;
    modal._blobUrl = currentBlobUrl;
  }

  // Show modal
  modal.classList.remove('pm-hidden');
  buildAndShow(currentOrientation);

  // Orientation buttons
  var orientBtns = modal.querySelectorAll('.pm-orient-btn');
  function handleOrient(e) {
    var btn = e.target.closest('.pm-orient-btn');
    if (!btn) return;
    var orient = btn.dataset.orient;
    if (orient === currentOrientation) return;
    currentOrientation = orient;
    orientBtns.forEach(function(b) { b.classList.toggle('pm-active', b.dataset.orient === orient); });
    buildAndShow(orient);
  }
  orientBtns.forEach(function(b) {
    b.removeEventListener('click', handleOrient);
    b.addEventListener('click', handleOrient);
  });

  // Close
  function closeModal() {
    modal.classList.add('pm-hidden');
    iframe.src = 'about:blank';
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
  }
  modal.querySelector('.pm-backdrop').onclick = closeModal;
  document.getElementById('pmClose').onclick = closeModal;

  // Download
  document.getElementById('pmDownload').onclick = function() {
    if (modal._pdfResult) {
      modal._pdfResult.pdf.save(modal._pdfResult.filename);
    }
  };

  // Print
  document.getElementById('pmPrint').onclick = function() {
    if (modal._blobUrl) {
      var printWin = window.open(modal._blobUrl, '_blank');
      if (printWin) {
        printWin.addEventListener('load', function() {
          setTimeout(function() { printWin.print(); }, 500);
        });
      }
    }
  };
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if needed.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}
