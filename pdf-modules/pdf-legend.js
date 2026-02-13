// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Legend
//  Legend/materials page: thread table, pattern info, size boxes.
//  Depends on pdf-helpers (pt, getLuminance).
// ══════════════════════════════════════════════════════════════════

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
 * Draw a redacted version of the legend page for preview PDFs.
 * Shows the real structure (table, info, boxes) but hides critical values
 * behind block characters, creating desire to see the real data.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Same options as drawLegend
 */
function drawRedactedLegend(pdf, opts) {
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
  var margin = 15;

  // Rounded pill placeholder bar (skeleton-style) to redact premium values
  function blurBar(x, baselineY, w, h) {
    h = h || 3.5;
    pdf.setFillColor(225, 218, 210);
    pdf.roundedRect(x, baselineY - h + 1, w, h, 1.2, 1.2, 'F');
  }

  drawBrandedHeader(pdf, text || '', fontName, width, height, pageNum, totalPages, margin, pageW);
  drawBrandedFooter(pdf, margin, pageW, pageH);

  var y = margin + 18;
  var contentW = pageW - margin * 2;
  var tW = Math.min(contentW, 220);
  var colPcts = [0, 0.10, 0.19, 0.31, 0.52, 0.68, 0.84];
  var colX = colPcts.map(function(p) { return margin + p * tW; });

  // -- Title --
  pdf.setFontSize(16);
  pdf.setTextColor(184, 58, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pt('pdf_thread_legend', 'Thread Legend'), margin, y);
  y += 10;

  // -- Thread table header (real) --
  var colLabels = [pt('pdf_col_symbol','Symbol'), pt('pdf_col_swatch','Swatch'), pt('pdf_col_dmc_code','DMC Code'), pt('pdf_col_color_name','Color Name'), pt('pdf_col_stitches','Stitches'), pt('pdf_col_thread','Thread'), pt('pdf_col_skeins','Skeins')];
  pdf.setFillColor(245, 240, 235);
  pdf.rect(margin, y - 3, tW, 8, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.setFont('helvetica', 'bold');
  for (var i = 0; i < colLabels.length; i++) {
    pdf.text(colLabels[i], colX[i] + 1, y + 2);
  }
  y += 10;
  pdf.setDrawColor(200, 190, 175);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y - 2, margin + tW, y - 2);

  // -- Data row: symbol + swatch real, values as clean blur bars --
  var luminance = getLuminance(color);

  // Symbol cell (real)
  pdf.setFillColor(color.r, color.g, color.b);
  pdf.rect(colX[0] + 1, y - 2, 10, 7, 'F');
  pdf.setTextColor(luminance < 0.5 ? 255 : 0, luminance < 0.5 ? 255 : 0, luminance < 0.5 ? 255 : 0);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('\u00D7', colX[0] + 6, y + 3, { align: 'center' });

  // Color swatch (real)
  pdf.setFillColor(color.r, color.g, color.b);
  pdf.rect(colX[1] + 1, y - 2, 14, 7, 'F');
  pdf.setDrawColor(180, 170, 160);
  pdf.setLineWidth(0.15);
  pdf.rect(colX[1] + 1, y - 2, 14, 7, 'S');

  // Redacted values: clean blur bars instead of block characters
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  // DMC code: label + blur bar
  pdf.setTextColor(60, 60, 60);
  pdf.text('DMC', colX[2] + 1, y + 2.5);
  blurBar(colX[2] + 1 + pdf.getTextWidth('DMC '), y + 2.5, 14);

  // Color name: blur bar
  blurBar(colX[3] + 1, y + 2.5, 28);

  // Stitches: real value
  pdf.setTextColor(60, 60, 60);
  pdf.text(String(stitchCount), colX[4] + 1, y + 2.5);

  // Thread: blur bar
  blurBar(colX[5] + 1, y + 2.5, 18);

  // Skeins: blur bar
  blurBar(colX[6] + 1, y + 2.5, 8);

  y += 12;

  pdf.setDrawColor(200, 190, 175);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y - 3, margin + tW, y - 3);
  y += 8;

  // -- Pattern Information (clean blur bars for redacted values) --
  pdf.setFontSize(13);
  pdf.setTextColor(184, 58, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.text(pt('pdf_pattern_info', 'Pattern Information'), margin, y);
  y += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  // Render bullet with text segments and inline blur bars
  function bulletLine(segments) {
    var x = margin + 2;
    pdf.setTextColor(70, 70, 70);
    pdf.text('\u2022', x, y);
    x += pdf.getTextWidth('\u2022') + 2;
    for (var s = 0; s < segments.length; s++) {
      if (segments[s].bar) {
        blurBar(x, y, segments[s].bar);
        x += segments[s].bar + 1;
      } else {
        pdf.setTextColor(70, 70, 70);
        pdf.text(segments[s].text, x, y);
        x += pdf.getTextWidth(segments[s].text);
      }
    }
    y += 5.8;
  }

  bulletLine([{ text: pt('pdf_note_strands', 'Use 2 strands of DMC thread for cross stitches') }]);
  bulletLine([{ text: pt('pdf_note_center', 'Start from the center of the fabric for best results') }]);
  bulletLine([
    { text: pt('pdf_info_fabric_aida', 'Fabric: Aida') + ' ' },
    { bar: 10 },
    { text: ' ct \u2014 ' + pt('pdf_info_each_stitch', 'Each stitch') + ' = ' },
    { bar: 12 },
    { text: ' mm' },
  ]);
  bulletLine([{ text: pt('pdf_info_pattern_size', 'Pattern size') + ': ' + width + ' \u00D7 ' + height + ' ' + pt('pdf_unit_stitches', 'stitches') }]);
  bulletLine([
    { text: pt('pdf_info_finished_size', 'Finished size') + ': ' },
    { bar: 32 },
  ]);
  bulletLine([{ text: pt('pdf_info_total_crosses', 'Total crosses') + ': ' + stitchCount }]);
  bulletLine([
    { text: pt('pdf_info_thread_required', 'Thread required') + ': ' },
    { bar: 38 },
  ]);
  bulletLine([{ text: '\u26a0 ' + pt('pdf_note_print', 'Print at 100% scale (no fit-to-page) for 1:1 stitch size') }]);
  y += 6;

  // -- Size boxes (blur bars instead of block chars) --
  var boxW = Math.min(tW / 2 - 4, 90);

  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.4);
  pdf.setFillColor(253, 248, 244);
  pdf.rect(margin, y, boxW, 22, 'FD');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text(pt('pdf_finished_size', 'Finished Size'), margin + 4, y + 6);
  blurBar(margin + 4, y + 13, 42, 4);

  var cutX = margin + boxW + 8;
  pdf.setDrawColor(184, 58, 42);
  pdf.setFillColor(253, 248, 244);
  pdf.rect(cutX, y, boxW, 22, 'FD');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text(pt('pdf_cut_fabric', 'Cut Fabric'), cutX + 4, y + 6);
  blurBar(cutX + 4, y + 13, 42, 4);

  y += 28;

  // -- Indie note --
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(160, 150, 140);
  pdf.text('Word2Stitch is an indie project by one stitching enthusiast.', margin + (tW / 2), y, { align: 'center' });
  y += 4;
  pdf.text('Every pattern you get helps keep this tool free for everyone.', margin + (tW / 2), y, { align: 'center' });
  y += 10;

  // -- CTA box --
  var ctaW = tW * 0.7;
  var ctaX = margin + (tW - ctaW) / 2;
  pdf.setDrawColor(184, 58, 42);
  pdf.setLineWidth(0.6);
  pdf.setFillColor(253, 248, 244);
  pdf.roundedRect(ctaX, y, ctaW, 24, 3, 3, 'FD');

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Get the full thread list and measurements for just $1.99', ctaX + ctaW / 2, y + 10, { align: 'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(140, 130, 120);
  pdf.text('word2stitch.vercel.app', ctaX + ctaW / 2, y + 18, { align: 'center' });
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
  y += 30;

  // Indie thank-you note (post-purchase validation)
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(170, 160, 150);
  pdf.text('Thank you for supporting Word2Stitch \u2014 an indie project made with love for the stitching community.', margin, y);
  pdf.text('Your support helps me keep building and improving this tool for crafters everywhere. Happy stitching! \u2764', margin, y + 4);
}
