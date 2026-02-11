// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Modal
//  Print preview modal UI and PDF generation entry point
// ══════════════════════════════════════════════════════════════════

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
    '.pm-close { background:none; border:none; font-size:18px; color:#a99e8f; cursor:pointer; padding:4px 8px; border-radius:6px; transition:background 0.15s, color 0.15s; }',
    '.pm-close:hover { background:rgba(184,58,42,0.08); color:#b83a2a; }',
    '.pm-orient-row { display:flex; gap:8px; padding:12px 18px; justify-content:center; }',
    '.pm-orient-btn { display:flex; align-items:center; gap:8px; padding:10px 20px; border:2px solid #e0d6c8; border-radius:10px; background:#fff; cursor:pointer; font-family:"Anybody",system-ui,sans-serif; font-size:13px; font-weight:600; color:#7a6e60; transition:border-color 0.15s, background 0.15s, color 0.15s; min-height:48px; }',
    '.pm-orient-btn:hover { border-color:#b83a2a; color:#b83a2a; }',
    '.pm-orient-btn.pm-active { border-color:#b83a2a; background:rgba(184,58,42,0.08); color:#b83a2a; }',
    '.pm-preview { flex:1; min-height:0; padding:0 18px; overflow:hidden; }',
    '.pm-iframe { width:100%; height:350px; border:1px solid #e0d6c8; border-radius:8px; background:#fff; }',
    '.pm-info { padding:8px 18px; font-size:12px; color:#7a6e60; text-align:center; }',
    '.pm-actions { display:flex; gap:10px; padding:14px 18px; border-top:1px solid #e0d6c8; justify-content:flex-end; }',
    '.pm-btn { display:flex; align-items:center; gap:6px; padding:10px 20px; border-radius:10px; font-family:"Anybody",system-ui,sans-serif; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:background 0.15s, color 0.15s, box-shadow 0.15s; min-height:48px; }',
    '.pm-btn-secondary { background:#fff; color:#3d3229; border:2px solid #e0d6c8; }',
    '.pm-btn-secondary:hover { border-color:#b83a2a; color:#b83a2a; }',
    '.pm-btn-primary { background:#b83a2a; color:#fff; }',
    '.pm-btn-primary:hover { background:#9c3023; box-shadow:0 3px 12px rgba(184,58,42,0.25); }',
    '@media(max-width:640px) { .pm-dialog { width:96vw; max-height:95vh; border-radius:10px; } .pm-preview { display:none; } .pm-orient-btn { padding:8px 14px; font-size:12px; } .pm-actions { flex-direction:column; } .pm-btn { justify-content:center; } }',
  ].join('\n');

  document.head.appendChild(style);
  document.body.appendChild(modal);

  // Apply i18n to modal UI strings
  modal.querySelector('.pm-title').textContent = '\u2715 ' + pt('pdf_print_preview', 'Print Preview');
  modal.querySelector('[data-orient="portrait"]').lastChild.textContent = ' ' + pt('pdf_orient_portrait', 'Portrait');
  modal.querySelector('[data-orient="landscape"]').lastChild.textContent = ' ' + pt('pdf_orient_landscape', 'Landscape');
  document.getElementById('pmDownload').lastChild.textContent = ' ' + pt('pdf_btn_download', 'Download PDF');
  document.getElementById('pmPrint').lastChild.textContent = ' ' + pt('pdf_btn_print', 'Print');
}

/**
 * Show the print preview modal.
 * Generates PDF in chosen orientation and displays in iframe.
 */
function generatePDF(text, fontData, dmcColor, aidaCount) {
  if (!text || !text.trim()) { alert(pt('pdf_alert_no_text', 'Please enter some text.')); return; }
  if (!fontData || !fontData.glyphs) { alert(pt('pdf_alert_no_font', 'No font selected.')); return; }
  if (!dmcColor) { alert(pt('pdf_alert_no_color', 'No color selected.')); return; }

  _createPrintModal();

  var modal = document.getElementById('printModal');
  var iframe = document.getElementById('pmIframe');
  var info = document.getElementById('pmInfo');
  var currentOrientation = 'portrait';
  var currentBlobUrl = null;

  function buildAndShow(orient) {
    var result = buildPDF(text, fontData, dmcColor, aidaCount, orient);
    if (!result) { alert(pt('pdf_alert_no_render', 'Could not render pattern.')); return; }

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    var blob = result.pdf.output('blob');
    currentBlobUrl = URL.createObjectURL(blob);

    iframe.src = currentBlobUrl;

    var cmW = (result.patternWidth / aidaCount * 2.54).toFixed(1);
    var cmH = (result.patternHeight / aidaCount * 2.54).toFixed(1);
    var inW = (result.patternWidth / aidaCount).toFixed(1);
    var inH = (result.patternHeight / aidaCount).toFixed(1);
    var isImperial = (typeof window.getDisplayUnit === 'function' && window.getDisplayUnit() === 'imperial');
    var sizeStr = isImperial ? (inW + ' \u00d7 ' + inH + '"') : (cmW + ' \u00d7 ' + cmH + ' cm');
    info.textContent = result.patternWidth + '\u00d7' + result.patternHeight +
      ' ' + pt('pdf_unit_stitches', 'stitches') + ' \u00b7 ' + sizeStr + ' \u00b7 ' +
      result.pages + ' ' + pt('pdf_unit_pages', 'pages') + ' \u00b7 ' + result.stitches + ' ' + pt('pdf_unit_crosses', 'crosses');

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
