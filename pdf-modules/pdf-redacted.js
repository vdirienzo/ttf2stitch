// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Redacted Legend
//  Preview-mode legend with skeleton blur bars hiding premium values.
//  Depends on pdf-helpers (pt, getLuminance) and pdf-chrome (header/footer).
// ══════════════════════════════════════════════════════════════════

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
