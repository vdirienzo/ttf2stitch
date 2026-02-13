// ui-modules/auth.js — License key verification + payment gate
// Manages license keys (localStorage), server verification via /api/verify,
// and the payment modal flow with Lemon Squeezy checkout overlay.

  var LICENSE_KEY_STORAGE = 'w2s_license_key';
  var _pendingPdfFn = null;

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnClose = document.getElementById('pay-close');

  // -- License key management --

  function getLicenseKey() {
    try { return localStorage.getItem(LICENSE_KEY_STORAGE) || ''; }
    catch (e) { return ''; }
  }

  function storeLicenseKey(key) {
    try { localStorage.setItem(LICENSE_KEY_STORAGE, key); }
    catch (e) { /* silent */ }
  }

  function clearLicenseKey() {
    try { localStorage.removeItem(LICENSE_KEY_STORAGE); }
    catch (e) { /* silent */ }
  }

  // -- Server verification --

  function verifyLicenseKey(key) {
    return fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key })
    })
    .then(function(res) { return res.json(); })
    .catch(function() { return { allowed: false, error: 'network' }; });
  }

  // -- Payment modal --

  function showPaymentModal() {
    // Hide print modal if it's open (avoid overlapping modals)
    var printModal = document.getElementById('printModal');
    if (printModal) printModal.classList.add('pm-hidden');

    if (payModalEl) {
      payModalEl.classList.remove('pay-hidden');
      // Reset subtitle to default
      var subtitle = payModalEl.querySelector('.pay-subtitle');
      if (subtitle) {
        subtitle.textContent = 'Get your thread list, color codes, and print-ready PDF \u2014 everything you need to start stitching.';
      }
    }
  }

  function hidePaymentModal() {
    if (payModalEl) payModalEl.classList.add('pay-hidden');
    // Restore print modal if it exists (user cancelled payment)
    var printModal = document.getElementById('printModal');
    if (printModal) printModal.classList.remove('pm-hidden');
  }

  // -- Payment flow --

  function requestPdfDownload(generateCompleteFn) {
    var key = getLicenseKey();
    if (!key) {
      _pendingPdfFn = generateCompleteFn;
      showPaymentModal();
      return;
    }
    // Has key — verify with server
    verifyLicenseKey(key).then(function(result) {
      if (result.allowed) {
        generateCompleteFn();
        updateCreditsDisplay(result.remaining);
      } else {
        if (result.error === 'exhausted' || result.error === 'expired' || result.error === 'invalid_key') {
          clearLicenseKey();
        }
        _pendingPdfFn = generateCompleteFn;
        showPaymentModal();
      }
    });
  }

  // Expose for pdf-modal.js (runs in global scope, outside this IIFE)
  window.requestPdfDownload = requestPdfDownload;

  // -- Credits display --

  function updateCreditsDisplay(remaining) {
    var el = document.getElementById('credits-display');
    if (!el) return;
    if (remaining < 0) {
      el.textContent = 'Unlimited';
    } else {
      el.textContent = remaining + ' downloads left';
    }
    el.classList.remove('pay-hidden');
  }

  // -- Checkout overlay (own iframe, no lemon.js dependency) --

  var _checkoutOverlay = null;
  var _checkoutIframe = null;
  var _paymentHandled = false;

  function showCheckoutOverlay(checkoutUrl) {
    _checkoutOverlay = document.createElement('div');
    _checkoutOverlay.className = 'ls-overlay';

    var loader = document.createElement('div');
    loader.className = 'ls-overlay-loader';
    loader.innerHTML = '<div class="ls-overlay-spinner"></div>';
    _checkoutOverlay.appendChild(loader);

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

    // Show license key input prompt (key arrives via email)
    showLicenseKeyPrompt();
  }

  function showLicenseKeyPrompt() {
    showPaymentModal();
    var subtitle = payModalEl.querySelector('.pay-subtitle');
    if (subtitle) {
      subtitle.textContent = 'Check your inbox \u2014 your pattern key is on its way! Paste it below.';
    }
    var keyField = document.getElementById('pay-key-field');
    if (keyField) keyField.focus();
  }

  // Listen for postMessage from LS checkout iframe
  window.addEventListener('message', function (e) {
    if (!_checkoutIframe) return;
    // Only accept messages from Lemon Squeezy checkout
    if (e.origin && e.origin.indexOf('lemonsqueezy.com') === -1) return;
    var data = e.data;

    if (data === 'mounted' && _checkoutOverlay) {
      var loader = _checkoutOverlay.querySelector('.ls-overlay-loader');
      if (loader) loader.remove();
    }

    if (data === 'close') {
      closeCheckoutOverlay();
    }

    var eventName = data && data.event ? data.event : '';
    if (eventName === 'Checkout.Success' || eventName === 'GA.Purchase') {
      handlePaymentSuccess();
    }
  });

  function goToCheckout(plan) {
    hidePaymentModal();

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: plan })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.url && data.url.indexOf('https://') === 0 &&
            data.url.indexOf('lemonsqueezy.com') !== -1) {
          showCheckoutOverlay(data.url);
        } else {
          console.error('Checkout error');
        }
      })
      .catch(function () {
        console.error('Checkout unavailable');
      });
  }

  // -- Bind modal buttons --

  // Plan buttons
  var payBtnSingle = document.getElementById('pay-single');
  var payBtnPack10 = document.getElementById('pay-pack10');
  var payBtnAnnual = document.getElementById('pay-annual');

  if (payBtnSingle) {
    payBtnSingle.addEventListener('click', function () {
      goToCheckout('single');
    });
  }
  if (payBtnPack10) {
    payBtnPack10.addEventListener('click', function () {
      goToCheckout('pack10');
    });
  }
  if (payBtnAnnual) {
    payBtnAnnual.addEventListener('click', function () {
      goToCheckout('annual');
    });
  }

  // Close / backdrop
  if (payBtnClose) {
    payBtnClose.addEventListener('click', hidePaymentModal);
  }
  if (payBackdrop) {
    payBackdrop.addEventListener('click', hidePaymentModal);
  }

  // License key input
  var payKeySubmit = document.getElementById('pay-key-submit');
  if (payKeySubmit) {
    payKeySubmit.addEventListener('click', function () {
      var keyField = document.getElementById('pay-key-field');
      var key = keyField ? keyField.value.trim() : '';
      if (!key) return;

      payKeySubmit.disabled = true;
      payKeySubmit.textContent = '...';

      verifyLicenseKey(key).then(function(result) {
        payKeySubmit.disabled = false;
        payKeySubmit.textContent = 'Activate';

        if (result.allowed) {
          storeLicenseKey(key);
          hidePaymentModal();
          updateCreditsDisplay(result.remaining);
          if (_pendingPdfFn) {
            _pendingPdfFn();
            _pendingPdfFn = null;
          }
        } else {
          alert('Invalid or exhausted license key. Please check and try again.');
        }
      });
    });
  }

  // -- Init --

  function initAuth(onReady) {
    // Check if user already has a key and show credits
    var existingKey = getLicenseKey();
    if (existingKey) {
      verifyLicenseKey(existingKey).then(function(result) {
        if (result.allowed) {
          updateCreditsDisplay(result.remaining);
        } else {
          clearLicenseKey();
        }
      });
    }
    onReady();
  }
