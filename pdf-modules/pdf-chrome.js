// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Chrome
//  Branded headers, footers, watermarks, and upgrade CTA page.
//  Depends on pdf-helpers (pt, truncate, getLuminance).
// ══════════════════════════════════════════════════════════════════

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
 * Draw a semi-transparent diagonal watermark on a grid page.
 * Uses jsPDF GState for transparency when available, falls back to light gray.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {number} pageW - Page width in mm
 * @param {number} pageH - Page height in mm
 */
function drawWatermark(pdf, pageW, pageH) {
  pdf.saveGraphicsState();

  // Try to apply transparency via GState (jsPDF 2.x)
  let usedGState = false;
  try {
    const GState = (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API &&
      window.jspdf.jsPDF.API.GState) || (pdf.GState);
    if (typeof GState === 'function') {
      pdf.setGState(new GState({ opacity: 0.08 }));
      pdf.setTextColor(184, 58, 42);
      usedGState = true;
    }
  } catch (e) {
    // GState not supported — fall through to fallback
  }

  if (!usedGState) {
    // Fallback: very light gray simulates low opacity on white background
    pdf.setTextColor(235, 225, 224);
  }

  pdf.setFontSize(48);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Word2Stitch', pageW / 2, pageH / 2, {
    align: 'center',
    angle: 35,
  });

  pdf.restoreGraphicsState();
}

/**
 * Draw the upgrade CTA page (replaces legend in preview mode).
 * Branded header/footer + call-to-action with feature list and pricing.
 *
 * @param {jsPDF} pdf - jsPDF instance
 * @param {object} opts - Page options
 * @param {number} opts.margin - Page margin in mm
 * @param {number} opts.pageW - Page width in mm
 * @param {number} opts.pageH - Page height in mm
 * @param {number} opts.pageNum - Current page number
 * @param {number} opts.totalPages - Total page count
 */
function drawUpgradePage(pdf, opts) {
  const margin = opts.margin;
  const pageW = opts.pageW;
  const pageH = opts.pageH;

  // Branded header (no pattern info — this is a CTA page)
  drawBrandedHeader(pdf, '', '', 0, 0, opts.pageNum, opts.totalPages, margin, pageW);
  drawBrandedFooter(pdf, margin, pageW, pageH);

  const centerX = pageW / 2;
  let y = pageH * 0.3;

  // Title
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Your pattern is ready to come to life', centerX, y, { align: 'center' });
  y += 12;

  // Subtitle
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Everything you need to start stitching \u2014 thread colors, quantities, and dimensions.', centerX, y, { align: 'center' });
  y += 20;

  // Feature checklist
  const items = [
    'Exact DMC thread colors you\u2019ll need',
    'How much thread to buy (meters + skeins)',
    'Finished size & fabric cutting guide',
    'Clean pattern, no watermark',
    'Print & stitch at true 1:1 scale',
  ];

  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  pdf.setFont('helvetica', 'normal');
  for (let i = 0; i < items.length; i++) {
    pdf.text('\u2713  ' + items[i], centerX - 60, y);
    y += 7;
  }
  y += 10;

  // Indie support message
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(140, 130, 120);
  pdf.text('Made with love by one person. Your support keeps Word2Stitch free for everyone.', centerX, y, { align: 'center' });
  y += 12;

  // Pricing
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Support an indie maker \u2014 from $1.99', centerX, y, { align: 'center' });
  y += 8;

  // URL
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(120, 120, 120);
  pdf.text('word2stitch.vercel.app', centerX, y, { align: 'center' });
}
