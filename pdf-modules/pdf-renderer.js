// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Renderer
//  Layout calculation, grid drawing, legend, headers/footers, and
//  PDF document assembly. Depends on pdf-helpers and pdf-bitmap.
// ══════════════════════════════════════════════════════════════════

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
  // Reserve space for coordinate labels on left (~5mm, vertical text) and top (~6mm)
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

/**
 * Draw one page section of the pattern grid.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Grid page options
 * @param {boolean[][]} opts.bitmap - Full 2D bitmap
 * @param {object} opts.color - { r, g, b } thread color
 * @param {number} opts.startCol - First column index for this page
 * @param {number} opts.startRow - First row index for this page
 * @param {number} opts.colsPerPage - Max columns that fit on one page
 * @param {number} opts.rowsPerPage - Max rows that fit on one page
 * @param {number} opts.cellSize - Cell size in mm
 * @param {object} opts.margins - { left, top } in mm
 * @param {object} opts.layout - Layout info from calculatePDFLayout
 */
function drawGridPage(pdf, opts) {
  var bitmap = opts.bitmap;
  var color = opts.color;
  var startCol = opts.startCol;
  var startRow = opts.startRow;
  var colsPerPage = opts.colsPerPage;
  var rowsPerPage = opts.rowsPerPage;
  var cellSize = opts.cellSize;
  var margins = opts.margins;
  var layout = opts.layout;

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
  const luminance = getLuminance(color);
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

  // Left edge labels (rotated 90 for compact width)
  for (let row = 0; row <= drawRows; row++) {
    const absRow = startRow + row;
    if (absRow % 10 === 0 && absRow > 0) {
      const y = offsetY + row * cellSize;
      pdf.text(String(absRow), offsetX - 1.5, y, { align: 'center', angle: 90 });
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
  pdf.text(pt('pdf_scale_verify', 'Verify: measure this bar with a ruler. Must be exactly 10 mm.'), barX + barLen / 2, barY + 3.5, { align: 'center' });
}

/**
 * Draw the thread table section of the legend page.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Legend options
 * @param {number} y - Current Y position
 * @returns {number} Updated Y position after drawing
 */
function drawThreadTable(pdf, opts, y) {
  var color = opts.color;
  var stitchCount = opts.stitchCount;
  var aidaCount = opts.aidaCount;
  var margin = opts.margin;
  var pageW = opts.pageW;

  // Thread calculation: ~0.013m per full cross stitch at Aida 14
  // (4 diagonal passes x stitch_size x sqrt(2) + 20% waste), scaled by fabric count
  const metersPerStitch = 0.013 * (14 / aidaCount);
  const meters = stitchCount * metersPerStitch;
  const skeins = Math.ceil(meters / 8);
  const preferImperial = (typeof window.getDisplayUnit === 'function' && window.getDisplayUnit() === 'imperial');

  // Table width adapts to page
  const contentW = pageW - margin * 2;
  const tW = Math.min(contentW, 220);
  const colPcts = [0, 0.10, 0.19, 0.31, 0.52, 0.68, 0.84];
  const colX = colPcts.map(function(p) { return margin + p * tW; });
  const colLabels = [pt('pdf_col_symbol','Symbol'), pt('pdf_col_swatch','Swatch'), pt('pdf_col_dmc_code','DMC Code'), pt('pdf_col_color_name','Color Name'), pt('pdf_col_stitches','Stitches'), pt('pdf_col_thread','Thread'), pt('pdf_col_skeins','Skeins')];

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
  const luminance = getLuminance(color);

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
  var threadText = preferImperial ? (meters * 1.09361).toFixed(2) + ' yd' : meters.toFixed(2) + ' m';
  pdf.text(threadText, colX[5] + 1, y + 2.5);
  pdf.text(String(skeins), colX[6] + 1, y + 2.5);
  y += 12;

  // Bottom line
  pdf.setDrawColor(200, 190, 175);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y - 3, margin + tW, y - 3);
  y += 8;

  return { y: y, meters: meters, skeins: skeins, preferImperial: preferImperial };
}

/**
 * Draw the pattern information section of the legend page.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Legend options
 * @param {number} y - Current Y position
 * @param {object} threadInfo - { meters, skeins, preferImperial } from drawThreadTable
 * @returns {number} Updated Y position after drawing
 */
function drawPatternInfo(pdf, opts, y, threadInfo) {
  var stitchCount = opts.stitchCount;
  var aidaCount = opts.aidaCount;
  var width = opts.width;
  var height = opts.height;
  var margin = opts.margin;
  var meters = threadInfo.meters;
  var skeins = threadInfo.skeins;
  var preferImperial = threadInfo.preferImperial;

  pdf.setFontSize(13);
  pdf.setTextColor(184, 58, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pt('pdf_pattern_info', 'Pattern Information'), margin, y);
  y += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(70, 70, 70);

  const stitchMm = (25.4 / aidaCount).toFixed(2);
  const inchesW = (width / aidaCount).toFixed(2);
  const inchesH = (height / aidaCount).toFixed(2);
  const cmW = (width / aidaCount * 2.54).toFixed(1);
  const cmH = (height / aidaCount * 2.54).toFixed(1);

  var yards = (meters * 1.09361).toFixed(2);
  var finishedSizeNote = preferImperial
    ? pt('pdf_info_finished_size', 'Finished size') + ': ' + inchesW + ' \u00D7 ' + inchesH + '" (' + cmW + ' \u00D7 ' + cmH + ' cm)'
    : pt('pdf_info_finished_size', 'Finished size') + ': ' + cmW + ' \u00D7 ' + cmH + ' cm (' + inchesW + ' \u00D7 ' + inchesH + '")';
  var threadNote = preferImperial
    ? pt('pdf_info_thread_required', 'Thread required') + ': ' + yards + ' yd (' + skeins + ' ' + (skeins !== 1 ? pt('pdf_unit_skeins', 'skeins') : pt('pdf_unit_skein', 'skein')) + ')'
    : pt('pdf_info_thread_required', 'Thread required') + ': ' + meters.toFixed(2) + ' m (' + skeins + ' ' + (skeins !== 1 ? pt('pdf_unit_skeins', 'skeins') : pt('pdf_unit_skein', 'skein')) + ')';

  const notes = [
    pt('pdf_note_strands', 'Use 2 strands of DMC thread for cross stitches'),
    pt('pdf_note_center', 'Start from the center of the fabric for best results'),
    pt('pdf_info_fabric_aida', 'Fabric: Aida') + ' ' + aidaCount.toFixed(1) + ' ct \u2014 ' + pt('pdf_info_each_stitch', 'Each stitch') + ' = ' + stitchMm + ' mm',
    pt('pdf_info_pattern_size', 'Pattern size') + ': ' + width + ' \u00D7 ' + height + ' ' + pt('pdf_unit_stitches', 'stitches'),
    finishedSizeNote,
    pt('pdf_info_total_crosses', 'Total crosses') + ': ' + stitchCount,
    threadNote,
    pt('pdf_note_print', '\u26a0 Print at 100% scale (no fit-to-page) for 1:1 stitch size'),
  ];

  for (const note of notes) {
    pdf.text('\u2022  ' + note, margin + 2, y);
    y += 5.8;
  }
  y += 6;

  return { y: y, inchesW: inchesW, inchesH: inchesH, cmW: cmW, cmH: cmH };
}

/**
 * Draw the finished size and cut fabric boxes on the legend page.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Legend options
 * @param {number} y - Current Y position
 * @param {object} sizeInfo - { inchesW, inchesH, cmW, cmH } from drawPatternInfo
 * @param {boolean} preferImperial - Whether to show imperial units first
 */
function drawSizeBoxes(pdf, opts, y, sizeInfo, preferImperial) {
  var margin = opts.margin;
  var pageW = opts.pageW;
  var contentW = pageW - margin * 2;
  var tW = Math.min(contentW, 220);

  var inchesW = sizeInfo.inchesW;
  var inchesH = sizeInfo.inchesH;
  var cmW = sizeInfo.cmW;
  var cmH = sizeInfo.cmH;

  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.4);
  pdf.setFillColor(253, 248, 244);
  const boxW = Math.min(tW / 2 - 4, 90);

  // Finished Size box
  pdf.rect(margin, y, boxW, 22, 'FD');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text(pt('pdf_finished_size', 'Finished Size'), margin + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  if (preferImperial) {
    pdf.text(inchesW + ' \u00D7 ' + inchesH + '"', margin + 4, y + 13);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 130, 120);
    pdf.text('(' + cmW + ' \u00D7 ' + cmH + ' cm)', margin + 4, y + 18);
  } else {
    pdf.text(cmW + ' \u00D7 ' + cmH + ' cm', margin + 4, y + 13);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 130, 120);
    pdf.text('(' + inchesW + ' \u00D7 ' + inchesH + '")', margin + 4, y + 18);
  }

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
  pdf.text(pt('pdf_cut_fabric', 'Cut Fabric'), cutX + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  if (preferImperial) {
    pdf.text(cutInW + ' \u00D7 ' + cutInH + '"', cutX + 4, y + 13);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 130, 120);
    pdf.text(pt('pdf_cut_margin_imperial', '(+3" margin each side)'), cutX + 4, y + 18);
  } else {
    pdf.text(cutCmW + ' \u00D7 ' + cutCmH + ' cm', cutX + 4, y + 13);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 130, 120);
    pdf.text(pt('pdf_cut_margin_metric', '(+7.6 cm margin each side)'), cutX + 4, y + 18);
  }
}

/**
 * Draw the legend/materials page.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Legend options
 * @param {object} opts.color - { code, name, hex, r, g, b }
 * @param {number} opts.stitchCount - Total filled stitches
 * @param {number} opts.aidaCount - Fabric count (11, 14, 16, 18)
 * @param {number} opts.width - Pattern width in stitches
 * @param {number} opts.height - Pattern height in stitches
 * @param {string} opts.fontName - Name of the font used
 * @param {string} opts.text - Pattern text
 * @param {number} opts.pageNum - Current page number
 * @param {number} opts.totalPages - Total page count
 * @param {number} opts.pageW - Page width in mm
 * @param {number} opts.pageH - Page height in mm
 */
function drawLegend(pdf, opts) {
  var color = opts.color;
  var stitchCount = opts.stitchCount;
  var aidaCount = opts.aidaCount;
  var width = opts.width;
  var height = opts.height;
  var fontName = opts.fontName;
  var text = opts.text;
  var pageNum = opts.pageNum;
  var totalPages = opts.totalPages;
  var pageW = opts.pageW || 210;
  var pageH = opts.pageH || 297;
  const margin = 15;

  // Branded header + footer
  drawBrandedHeader(pdf, text || '', fontName, width, height, pageNum, totalPages, margin, pageW);
  drawBrandedFooter(pdf, margin, pageW, pageH);

  let y = margin + 18; // after branded header bar

  // Title
  pdf.setFontSize(16);
  pdf.setTextColor(184, 58, 42); // accent color
  pdf.setFont('helvetica', 'bold');
  pdf.text(pt('pdf_thread_legend', 'Thread Legend'), margin, y);
  y += 10;

  var legendOpts = { color: color, stitchCount: stitchCount, aidaCount: aidaCount, width: width, height: height, margin: margin, pageW: pageW };

  // Thread table
  var threadResult = drawThreadTable(pdf, legendOpts, y);
  y = threadResult.y;

  // Pattern information
  var patternResult = drawPatternInfo(pdf, legendOpts, y, threadResult);
  y = patternResult.y;

  // Size boxes
  drawSizeBoxes(pdf, legendOpts, y, patternResult, threadResult.preferImperial);
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

  // Logo: X Word2Stitch
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
  pdf.text('\u2715 Word2Stitch \u2014 ' + pt('pdf_footer_tagline', 'Cross-Stitch Pattern Generator'), margin, footerY + 4);

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

      drawGridPage(pdf, {
        bitmap: bitmap,
        color: { r: dmcColor.r, g: dmcColor.g, b: dmcColor.b },
        startCol: startCol,
        startRow: startRow,
        colsPerPage: layout.colsPerPage,
        rowsPerPage: layout.rowsPerPage,
        cellSize: cellSize,
        margins: { left: margin, top: margin + headerHeight },
        layout: layout,
      });
    }
  }

  pdf.addPage();
  drawLegend(pdf, {
    color: dmcColor,
    stitchCount: stitchCount,
    aidaCount: aidaCount,
    width: patternWidth,
    height: patternHeight,
    fontName: fontName,
    text: text,
    pageNum: totalPagesWithLegend,
    totalPages: totalPagesWithLegend,
    pageW: pageW,
    pageH: pageH,
  });

  const safeText = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40);
  const safeId = (fontData.id || 'font').replace(/[^a-z0-9-]/g, '');
  const filename = 'word2stitch-' + (safeText || 'pattern') + '-' + safeId + '.pdf';

  return { pdf, filename, pages: totalPagesWithLegend, stitches: stitchCount, patternWidth, patternHeight };
}
