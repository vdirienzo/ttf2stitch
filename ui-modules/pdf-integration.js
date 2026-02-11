// ui-modules/pdf-integration.js — Download PDF button handler
// Calls generatePDF from pdf-engine

  // -- Download PDF --

  btnDownload.addEventListener('click', function () {
    var color = getCurrentColor();
    if (!currentFontData || !currentText.trim()) {
      alert(t('alert_no_text'));
      return;
    }
    if (typeof generatePDF !== 'function') {
      alert(t('alert_no_pdf'));
      return;
    }
    if (!window.jspdf) {
      alert(t('alert_no_jspdf'));
      return;
    }
    try {
      generatePDF(currentText, currentFontData, color, currentAida);
    } catch (err) {
      alert(t('alert_pdf_fail') + err.message);
      console.error('PDF error:', err);
    }
  });
