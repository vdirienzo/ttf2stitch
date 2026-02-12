// ui-modules/auth.js — Payment gate (Lemon Squeezy checkout overlay)
// App is open to everyone. Pay per PDF or subscribe for unlimited.
// Checkout happens IN the page as overlay — no redirect needed.

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnOnetime = document.getElementById('pay-onetime');
  var payBtnSubscribe = document.getElementById('pay-subscribe');
  var payBtnClose = document.getElementById('pay-close');

  // Lemon Squeezy checkout URLs (from dashboard)
  var LS_ONETIME_URL = 'https://infinis.lemonsqueezy.com/checkout/buy/cc335ab8-b79e-46a1-89d8-24e19a034dbd';
  var LS_SUBSCRIBE_URL = 'https://infinis.lemonsqueezy.com/checkout/buy/46c36545-580d-476f-a91a-45df9950454c';

  var _pendingPdfFn = null;

  function showPaymentModal() {
    if (payModalEl) payModalEl.classList.remove('pay-hidden');
  }

  function hidePaymentModal() {
    if (payModalEl) payModalEl.classList.add('pay-hidden');
  }

  /**
   * Called by pdf-integration.js instead of directly generating PDF.
   * Shows payment modal — user picks one-time or subscription.
   */
  function requestPdfDownload(generateFn) {
    _pendingPdfFn = generateFn;
    showPaymentModal();
  }

  function openLemonCheckout(url) {
    hidePaymentModal();
    if (window.LemonSqueezy) {
      window.LemonSqueezy.Url.Open(url);
    } else {
      window.open(url, '_blank');
    }
  }

  // -- Bind modal buttons --

  if (payBtnOnetime) {
    payBtnOnetime.addEventListener('click', function () {
      openLemonCheckout(LS_ONETIME_URL);
    });
  }
  if (payBtnSubscribe) {
    payBtnSubscribe.addEventListener('click', function () {
      openLemonCheckout(LS_SUBSCRIBE_URL);
    });
  }
  if (payBtnClose) {
    payBtnClose.addEventListener('click', hidePaymentModal);
  }
  if (payBackdrop) {
    payBackdrop.addEventListener('click', hidePaymentModal);
  }

  // -- Lemon Squeezy event handling --

  function setupLemonEvents() {
    if (!window.LemonSqueezy) return;
    window.LemonSqueezy.Setup({
      eventHandler: function (event) {
        if (event.event === 'Checkout.Success') {
          // Close the LS overlay immediately so user sees the app
          try { window.LemonSqueezy.Url.Close(); } catch (e) { /* ignore */ }

          // Short delay to let overlay close, then trigger PDF download
          setTimeout(function () {
            if (_pendingPdfFn) {
              try {
                _pendingPdfFn();
              } catch (err) {
                console.error('PDF generation after payment failed:', err);
              }
              _pendingPdfFn = null;
            }
          }, 500);
        }
      }
    });
  }

  // -- Init (app loads immediately, no auth gate) --

  function initAuth(onReady) {
    onReady();

    var lsCheck = setInterval(function () {
      if (window.LemonSqueezy) {
        clearInterval(lsCheck);
        setupLemonEvents();
      }
    }, 200);
    setTimeout(function () { clearInterval(lsCheck); }, 15000);
  }
