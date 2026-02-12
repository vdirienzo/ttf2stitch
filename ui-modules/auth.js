// ui-modules/auth.js — Payment gate (Lemon Squeezy redirect checkout)
// App is open to everyone. Pay per PDF or subscribe for unlimited.
// Saves pattern state to localStorage, redirects to LS, auto-downloads on return.

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnOnetime = document.getElementById('pay-onetime');
  var payBtnSubscribe = document.getElementById('pay-subscribe');
  var payBtnClose = document.getElementById('pay-close');

  // Lemon Squeezy checkout URLs (from dashboard)
  var LS_BASE_ONETIME = 'https://infinis.lemonsqueezy.com/checkout/buy/cc335ab8-b79e-46a1-89d8-24e19a034dbd';
  var LS_BASE_SUBSCRIBE = 'https://infinis.lemonsqueezy.com/checkout/buy/46c36545-580d-476f-a91a-45df9950454c';

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

  function goToCheckout(baseUrl) {
    hidePaymentModal();
    // Save pattern state before leaving the page
    savePendingDownload();
    // Redirect to LS checkout with return URL
    var returnUrl = encodeURIComponent(window.location.origin + '/?payment=success');
    window.location.href = baseUrl + '?checkout[custom][return_url]=' + returnUrl;
  }

  // -- Bind modal buttons --

  if (payBtnOnetime) {
    payBtnOnetime.addEventListener('click', function () {
      goToCheckout(LS_BASE_ONETIME);
    });
  }
  if (payBtnSubscribe) {
    payBtnSubscribe.addEventListener('click', function () {
      goToCheckout(LS_BASE_SUBSCRIBE);
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

      // Wait for pattern to load, then trigger PDF
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
      }, 2500);
    }
  }
