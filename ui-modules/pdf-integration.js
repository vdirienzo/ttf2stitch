// ui-modules/pdf-integration.js — Download PDF button handler
// Opens the print preview modal (free preview). Payment gate is inside
// the modal for Download Complete and Print actions.

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

    // Always show preview (free, no payment needed)
    generatePDF(currentText, currentFontData, color, currentAida);
  });
