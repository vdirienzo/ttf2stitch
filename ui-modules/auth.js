// ui-modules/auth.js — Payment gate (LS Checkouts API + in-page iframe overlay)
// App is open to everyone. Pay per PDF or subscribe for unlimited.
// Creates checkout via /api/checkout, shows LS in an iframe overlay,
// listens for postMessage events to detect payment success.

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

  /**
   * Called by pdf-integration.js instead of directly generating PDF.
   * Shows payment modal — user picks one-time or subscription.
   */
  function requestPdfDownload(generateFn) {
    _pendingPdfFn = generateFn;
    showPaymentModal();
  }

  // -- Checkout overlay (own iframe, no lemon.js dependency) --

  var _checkoutOverlay = null;
  var _checkoutIframe = null;
  var _paymentHandled = false;

  function showCheckoutOverlay(checkoutUrl) {
    // Backdrop
    _checkoutOverlay = document.createElement('div');
    _checkoutOverlay.className = 'ls-overlay';

    // Loading spinner
    var loader = document.createElement('div');
    loader.className = 'ls-overlay-loader';
    loader.innerHTML = '<div class="ls-overlay-spinner"></div>';
    _checkoutOverlay.appendChild(loader);

    // Iframe
    _checkoutIframe = document.createElement('iframe');
    _checkoutIframe.className = 'ls-overlay-iframe';
    _checkoutIframe.src = checkoutUrl;
    _checkoutIframe.allow = 'payment';
    _checkoutOverlay.appendChild(_checkoutIframe);

    document.body.appendChild(_checkoutOverlay);
    _paymentHandled = false;
  }

  function closeCheckoutOverlay() {
    if (_checkoutOverlay) {
      _checkoutOverlay.remove();
      _checkoutOverlay = null;
      _checkoutIframe = null;
    }
  }

  function handlePaymentSuccess() {
    if (_paymentHandled) return;
    _paymentHandled = true;

    closeCheckoutOverlay();

    // Trigger PDF download
    setTimeout(function () {
      if (_pendingPdfFn) {
        try {
          _pendingPdfFn();
        } catch (err) {
          console.error('PDF generation after payment failed:', err);
        }
        _pendingPdfFn = null;
      }
    }, 400);
  }

  // Listen for postMessage from LS checkout iframe
  window.addEventListener('message', function (e) {
    if (!_checkoutIframe) return;
    var data = e.data;

    // "mounted" = checkout loaded, hide spinner
    if (data === 'mounted' && _checkoutOverlay) {
      var loader = _checkoutOverlay.querySelector('.ls-overlay-loader');
      if (loader) loader.remove();
    }

    // "close" = user closed the checkout
    if (data === 'close') {
      closeCheckoutOverlay();
    }

    // Payment success detection
    var eventName = data && data.event ? data.event : '';
    if (eventName === 'Checkout.Success' || eventName === 'GA.Purchase') {
      handlePaymentSuccess();
    }
  });

  function goToCheckout(plan) {
    hidePaymentModal();

    // Call our API to create an embeddable checkout URL
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: plan })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.url) {
          showCheckoutOverlay(data.url);
        } else {
          console.error('Checkout error:', data.error);
        }
      })
      .catch(function (err) {
        console.error('Checkout fetch failed:', err);
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

  // -- Init --

  function initAuth(onReady) {
    onReady();
  }
