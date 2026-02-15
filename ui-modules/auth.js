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

  // -- Read-only check (does NOT consume credits) --

  function checkLicenseKey(key) {
    return fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key })
    })
    .then(function(res) { return res.json(); })
    .catch(function() { return { valid: false, error: 'network' }; });
  }

  // -- Payment modal --

  function showPaymentModal() {
    // Hide print modal if it's open (avoid overlapping modals)
    var printModal = document.getElementById('printModal');
    if (printModal) printModal.classList.add('pm-hidden');

    if (payModalEl) {
      payModalEl.classList.remove('pay-hidden');
      payModalEl.classList.remove('pay-key-only');
      // Reset title and subtitle to defaults (i18n)
      var title = payModalEl.querySelector('.pay-title');
      if (title) title.textContent = t('pay_title');
      var subtitle = payModalEl.querySelector('.pay-subtitle');
      if (subtitle) {
        subtitle.textContent = t('pay_subtitle');
      }
      // Personalize title with user's pattern text
      var userText = '';
      var textInput = document.getElementById('textInput');
      if (textInput) userText = textInput.value.trim();
      if (!userText) {
        var mobileInput = document.getElementById('mobileTextInput');
        if (mobileInput) userText = mobileInput.value.trim();
      }
      if (title && userText) {
        var personalizedTitle = t('pay_title_personalized');
        if (personalizedTitle !== 'pay_title_personalized') {
          var truncated = userText.length > 30 ? userText.substring(0, 30) + '\u2026' : userText;
          title.textContent = personalizedTitle.replace('{text}', truncated);
        }
      }
    }
  }

  function hidePaymentModal(restorePrint) {
    if (payModalEl) payModalEl.classList.add('pay-hidden');
    // Restore print modal only on cancel (not after successful payment)
    if (restorePrint !== false) {
      var printModal = document.getElementById('printModal');
      if (printModal) printModal.classList.remove('pm-hidden');
    }
  }

  // -- Payment flow --

  function requestPdfDownload(generateCompleteFn) {
    var key = getLicenseKey();
    if (!key) {
      _pendingPdfFn = generateCompleteFn;
      try { sessionStorage.setItem('w2s_pending_download', '1'); } catch(e) {}
      showPaymentModal();
      return;
    }
    // Has key — verify with server
    verifyLicenseKey(key).then(function(result) {
      if (result.allowed) {
        try { sessionStorage.removeItem('w2s_pending_download'); } catch(e) {}
        generateCompleteFn();
        updateCreditsDisplay(result.remaining);
      } else {
        if (result.error === 'exhausted' || result.error === 'expired' || result.error === 'invalid_key') {
          clearLicenseKey();
        }
        _pendingPdfFn = generateCompleteFn;
        try { sessionStorage.setItem('w2s_pending_download', '1'); } catch(e) {}
        showPaymentModal();
      }
    });
  }

  // Expose for pdf-modal.js and checkout overlay retry button (run in global scope)
  window.requestPdfDownload = requestPdfDownload;
  window.closeCheckoutOverlay = closeCheckoutOverlay;
  window.showPaymentModal = showPaymentModal;

  // -- Credits display --

  function updateCreditsDisplay(remaining) {
    var el = document.getElementById('credits-display');
    if (!el) return;
    if (remaining < 0) {
      el.textContent = t('pay_credits_unlimited');
    } else {
      el.textContent = remaining + ' ' + t('pay_credits_remaining');
    }
    el.classList.remove('pay-hidden');
  }

  // -- Checkout overlay (own iframe, no lemon.js dependency) --

  var _checkoutOverlay = null;
  var _checkoutIframe = null;
  var _checkoutTimeout = null;
  var _paymentHandled = false;

  function showCheckoutOverlay(checkoutUrl) {
    _checkoutOverlay = document.createElement('div');
    _checkoutOverlay.className = 'ls-overlay';

    // Escape button (fades in after 1.5s so it doesn't interfere with iframe load)
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ls-overlay-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close checkout';
    closeBtn.addEventListener('click', function() {
      closeCheckoutOverlay();
      showPaymentModal();
    });
    _checkoutOverlay.appendChild(closeBtn);

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

    // Iframe load timeout — show retry after 15s
    _checkoutTimeout = setTimeout(function() {
      if (_checkoutOverlay) {
        var loader = _checkoutOverlay.querySelector('.ls-overlay-loader');
        if (loader) {
          loader.innerHTML = '<div style="color:#fff;text-align:center;padding:2rem;">' +
            '<p>' + t('pay_checkout_slow') + '</p>' +
            '<button onclick="closeCheckoutOverlay();showPaymentModal();" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#fff;color:#3d3229;border:none;border-radius:8px;cursor:pointer;font-weight:600;">' + t('pay_checkout_retry') + '</button>' +
            '</div>';
        }
      }
    }, 15000);
  }

  function closeCheckoutOverlay() {
    clearTimeout(_checkoutTimeout);
    if (_checkoutOverlay) {
      _checkoutOverlay.remove();
      _checkoutOverlay = null;
      _checkoutIframe = null;
    }
  }

  function handlePaymentSuccess(eventData) {
    if (_paymentHandled) return;
    _paymentHandled = true;

    closeCheckoutOverlay();

    // Try auto-activation first, fallback to manual key entry
    var orderId = extractOrderId(eventData);
    if (orderId) {
      autoActivateOrder(orderId);
    } else {
      showLicenseKeyPrompt();
    }
  }

  function extractOrderId(eventData) {
    if (!eventData || typeof eventData !== 'object') return '';
    // LS Checkout.Success format: { event, data: { id, attributes: { order_number } } }
    var data = eventData.data;
    if (data) {
      if (data.attributes) {
        return String(data.attributes.order_number || data.id || '');
      }
      if (data.id) return String(data.id);
      // Legacy fallback: data.order (defensive)
      var order = data.order;
      if (order) return String(order.order_number || order.identifier || order.id || '');
    }
    // Top-level fallback
    if (eventData.order) {
      return String(eventData.order.order_number || eventData.order.identifier || eventData.order.id || '');
    }
    return '';
  }

  function autoActivateOrder(orderId) {
    // Show activating state in modal
    showPaymentModal();
    if (payModalEl) payModalEl.classList.add('pay-key-only');
    var title = payModalEl.querySelector('.pay-title');
    if (title) title.textContent = t('pay_title_activating');
    var subtitle = payModalEl.querySelector('.pay-subtitle');
    if (subtitle) subtitle.textContent = t('pay_subtitle_activating');

    fetch('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      if (result.allowed && result.license_key) {
        storeLicenseKey(result.license_key);
        try { sessionStorage.removeItem('w2s_pending_download'); } catch(e) {}
        updateCreditsDisplay(result.remaining);
        hidePaymentModal(false);
        if (_pendingPdfFn) {
          _pendingPdfFn();
          _pendingPdfFn = null;
        }
      } else {
        // Fallback to manual key entry
        showLicenseKeyPrompt();
      }
    })
    .catch(function() {
      // Fallback to manual key entry on network error
      showLicenseKeyPrompt();
    });
  }

  function showLicenseKeyPrompt() {
    showPaymentModal();
    // Switch to key-only mode: hide plan cards, show only key input
    if (payModalEl) payModalEl.classList.add('pay-key-only');
    var title = payModalEl.querySelector('.pay-title');
    if (title) title.textContent = t('pay_title_success');
    var subtitle = payModalEl.querySelector('.pay-subtitle');
    if (subtitle) {
      subtitle.textContent = t('pay_subtitle_success');
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
      clearTimeout(_checkoutTimeout);
      var loader = _checkoutOverlay.querySelector('.ls-overlay-loader');
      if (loader) loader.remove();
    }

    if (data === 'close') {
      closeCheckoutOverlay();
      showPaymentModal();
    }

    var eventName = data && data.event ? data.event : '';
    if (eventName === 'Checkout.Success' || eventName === 'GA.Purchase') {
      handlePaymentSuccess(data);
    }
  });

  // ESC key closes checkout overlay or payment modal
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (_checkoutOverlay) {
        closeCheckoutOverlay();
        showPaymentModal();
      } else if (payModalEl && !payModalEl.classList.contains('pay-hidden')) {
        hidePaymentModal();
      }
    }
  });

  // Direct checkout URLs from Lemon Squeezy dashboard
  var CHECKOUT_URLS = {
    single: 'https://infinis.lemonsqueezy.com/checkout/buy/54636d22-edf5-4542-bb96-096f8421c872',
    pack10: 'https://infinis.lemonsqueezy.com/checkout/buy/8e42106f-beb8-4780-8d19-39ac427f4430',
    annual: 'https://infinis.lemonsqueezy.com/checkout/buy/dcb8543d-c293-42bd-875e-ec7029e2ab95'
  };

  function goToCheckout(plan) {
    hidePaymentModal(false);

    var directUrl = CHECKOUT_URLS[plan];
    if (directUrl) {
      // Build optimized checkout URL
      var params = 'embed=1&button_color=%23b83a2a&media=0&desc=0';
      var lang = navigator.language || '';
      var country = lang.split('-')[1];
      if (country && country.length === 2) {
        params += '&checkout[billing_address][country]=' + country.toUpperCase();
      }
      // Safari/Brave block third-party iframes — open in new tab instead
      var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      var isBrave = navigator.brave && navigator.brave.isBrave;
      if (isSafari || isBrave) {
        window.open(directUrl + '?' + params.replace('embed=1&', ''), '_blank');
        return;
      }
      showCheckoutOverlay(directUrl + '?' + params);
      return;
    }

    // Fallback: create checkout via API (for custom plans or future use)
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
  var payKeyField = document.getElementById('pay-key-field');

  // Clear inline error when user starts typing
  if (payKeyField) {
    payKeyField.addEventListener('input', function() {
      var errorEl = document.getElementById('pay-key-error');
      if (errorEl) errorEl.textContent = '';
    });
  }

  if (payKeySubmit) {
    payKeySubmit.addEventListener('click', function () {
      var keyField = document.getElementById('pay-key-field');
      var key = keyField ? keyField.value.trim() : '';
      if (!key) return;

      payKeySubmit.disabled = true;
      payKeySubmit.textContent = '...';

      verifyLicenseKey(key).then(function(result) {
        payKeySubmit.disabled = false;
        payKeySubmit.textContent = t('pay_key_submit');

        if (result.allowed) {
          // Clear any inline error
          var errorEl = document.getElementById('pay-key-error');
          if (errorEl) errorEl.textContent = '';
          storeLicenseKey(key);
          try { sessionStorage.removeItem('w2s_pending_download'); } catch(e) {}
          hidePaymentModal(false);
          updateCreditsDisplay(result.remaining);
          if (_pendingPdfFn) {
            _pendingPdfFn();
            _pendingPdfFn = null;
          }
        } else {
          // Show inline error instead of alert()
          var errorEl = document.getElementById('pay-key-error');
          if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'pay-key-error';
            errorEl.style.cssText = 'color:#b83a2a;font-size:0.8rem;margin-top:0.5rem;';
            var keyInput = document.querySelector('.pay-key-input');
            if (keyInput) keyInput.parentNode.insertBefore(errorEl, keyInput.nextSibling);
          }
          errorEl.textContent = t('pay_key_error');
        }
      });
    });
  }

  // -- Init --

  function initAuth(onReady) {
    // Handle ?payment=success redirect (from API fallback checkout path)
    if (window.location.search.indexOf('payment=success') !== -1) {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(function() { showLicenseKeyPrompt(); }, 300);
    }

    // Restore pending download state after page refresh during checkout
    try {
      if (sessionStorage.getItem('w2s_pending_download') === '1') {
        sessionStorage.removeItem('w2s_pending_download');
        var existingKey2 = getLicenseKey();
        if (!existingKey2) {
          setTimeout(function() { showLicenseKeyPrompt(); }, 300);
        }
      }
    } catch(e) {}

    // Check if user already has a key and show credits (read-only, no credit burn)
    var existingKey = getLicenseKey();
    if (existingKey) {
      checkLicenseKey(existingKey).then(function(result) {
        if (result.valid) {
          updateCreditsDisplay(result.remaining);
        } else {
          clearLicenseKey();
        }
      });
    }
    onReady();
  }
