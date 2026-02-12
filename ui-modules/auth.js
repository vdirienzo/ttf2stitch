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

  var _pendingReturn = null;

  function initAuth(onReady) {
    // Check for payment return BEFORE init so state is set before fetchFontList
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      try { _pendingReturn = JSON.parse(localStorage.getItem('w2s_pending_pdf')); } catch (e) { /* ignore */ }
      if (_pendingReturn) {
        // Restore state variables before init() runs (so fetchFontList uses them)
        currentText = _pendingReturn.text || currentText;
        currentFontFile = _pendingReturn.font || currentFontFile;
        currentHeight = _pendingReturn.height || currentHeight;
        currentColorCode = _pendingReturn.color || currentColorCode;
        currentAida = _pendingReturn.aida || currentAida;
        currentAlign = _pendingReturn.align || currentAlign;
        // Update DOM inputs so they match restored state
        if (textInput) textInput.value = currentText;
        if (heightSlider) { heightSlider.value = currentHeight; }
        if (heightValue) { heightValue.textContent = currentHeight; }
      }
    }

    // Now run init() — fetchFontList will use the restored state
    onReady();

    // After init, trigger PDF download if returning from payment
    if (_pendingReturn) {
      clearPendingDownload();
      // Poll until font data is loaded, then generate PDF
      var pdfAttempts = 0;
      var pdfInterval = setInterval(function () {
        pdfAttempts++;
        if (currentFontData && typeof generatePDF === 'function') {
          clearInterval(pdfInterval);
          var color = getCurrentColor();
          try {
            generatePDF(currentText, currentFontData, color, currentAida);
          } catch (err) {
            console.error('Auto PDF download failed:', err);
          }
          _pendingReturn = null;
        }
        if (pdfAttempts > 30) { clearInterval(pdfInterval); } // 15s timeout
      }, 500);
    }
  }
