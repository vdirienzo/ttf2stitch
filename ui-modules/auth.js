// ui-modules/auth.js — Payment gate (Stripe one-time per PDF)
// App is open to everyone. No accounts needed. Pay $1.99 per PDF download.

  // -- Payment modal --

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnOnetime = document.getElementById('pay-onetime');
  var payBtnClose = document.getElementById('pay-close');

  function showPaymentModal() {
    if (payModalEl) payModalEl.classList.remove('pay-hidden');
  }

  function hidePaymentModal() {
    if (payModalEl) payModalEl.classList.add('pay-hidden');
  }

  function savePendingDownload() {
    try {
      localStorage.setItem('w2s_pending_pdf', JSON.stringify({
        text: currentText,
        font: currentFontFile,
        height: currentHeight,
        color: currentColorCode,
        aida: currentAida,
        align: currentAlign
      }));
    } catch (e) { /* ignore */ }
  }

  function clearPendingDownload() {
    try { localStorage.removeItem('w2s_pending_pdf'); } catch (e) { /* ignore */ }
  }

  function handlePayment() {
    savePendingDownload();

    var origin = window.location.origin;

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'payment',
        success_url: origin + '/?payment=success',
        cancel_url: origin + '/?payment=cancelled'
      })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('Checkout failed');
      return res.json();
    })
    .then(function (data) {
      if (data.url) window.location.href = data.url;
    })
    .catch(function (err) {
      console.error('Checkout error:', err);
      hidePaymentModal();
    });
  }

  /**
   * Called by pdf-integration.js instead of directly generating PDF.
   * Always shows payment modal — every PDF costs $1.99.
   */
  function requestPdfDownload(generateFn) {
    window._pendingPdfGenerate = generateFn;
    showPaymentModal();
  }

  // -- Bind payment modal buttons --

  if (payBtnOnetime) {
    payBtnOnetime.addEventListener('click', handlePayment);
  }
  if (payBtnClose) {
    payBtnClose.addEventListener('click', hidePaymentModal);
  }
  if (payBackdrop) {
    payBackdrop.addEventListener('click', hidePaymentModal);
  }

  // -- Init (no auth gate, app loads immediately) --

  function initAuth(onReady) {
    onReady();

    // Check for payment return
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);

      // Trigger pending PDF download
      setTimeout(function () {
        var pending = null;
        try { pending = JSON.parse(localStorage.getItem('w2s_pending_pdf')); } catch (e) { /* ignore */ }
        if (pending && typeof generatePDF === 'function' && currentFontData) {
          clearPendingDownload();
          var color = getCurrentColor();
          try {
            generatePDF(currentText, currentFontData, color, currentAida);
          } catch (err) {
            console.error('Auto PDF download failed:', err);
          }
        }
      }, 2000);
    }
  }
