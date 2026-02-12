// ui-modules/auth.js — Payment gate (Lemon Squeezy API checkout with redirect)
// App is open to everyone. Pay per PDF or subscribe for unlimited.
// Creates checkout via /api/checkout, redirects to LS, auto-downloads on return.

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnOnetime = document.getElementById('pay-onetime');
  var payBtnSubscribe = document.getElementById('pay-subscribe');
  var payBtnClose = document.getElementById('pay-close');

  var _pendingPdfFn = null;

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

  /**
   * Called by pdf-integration.js instead of directly generating PDF.
   * Shows payment modal — user picks one-time or subscription.
   */
  function requestPdfDownload(generateFn) {
    _pendingPdfFn = generateFn;
    showPaymentModal();
  }

  function goToCheckout(plan) {
    hidePaymentModal();
    savePendingDownload();

    // Call our API to create a checkout with redirect_url baked in
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: plan })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error('Checkout error:', data.error);
          clearPendingDownload();
        }
      })
      .catch(function (err) {
        console.error('Checkout fetch failed:', err);
        clearPendingDownload();
      });
  }

  // -- Bind modal buttons --

  if (payBtnOnetime) {
    payBtnOnetime.addEventListener('click', function () {
      goToCheckout('onetime');
    });
  }
  if (payBtnSubscribe) {
    payBtnSubscribe.addEventListener('click', function () {
      goToCheckout('subscribe');
    });
  }
  if (payBtnClose) {
    payBtnClose.addEventListener('click', hidePaymentModal);
  }
  if (payBackdrop) {
    payBackdrop.addEventListener('click', hidePaymentModal);
  }

  // -- Init (app loads immediately, no auth gate) --

  function initAuth(onReady) {
    onReady();

    // Check for payment return — auto-download PDF
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);

      // Wait for fonts and pattern to load, then trigger PDF
      setTimeout(function () {
        var pending = null;
        try { pending = JSON.parse(localStorage.getItem('w2s_pending_pdf')); } catch (e) { /* ignore */ }
        if (pending) {
          clearPendingDownload();
          // Wait for font data to be ready after page restore
          setTimeout(function () {
            if (typeof generatePDF === 'function' && currentFontData) {
              var color = getCurrentColor();
              try {
                generatePDF(currentText, currentFontData, color, currentAida);
              } catch (err) {
                console.error('Auto PDF download failed:', err);
              }
            }
          }, 2000);
        }
      }, 2500);
    }
  }
