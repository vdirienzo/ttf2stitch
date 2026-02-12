// ui-modules/auth.js — Optional auth + payment gate (Clerk + Stripe)
// App is open to everyone. Clerk is optional (for subscription management).
// PDF download is the monetization point.

  var clerkUserBtn = document.getElementById('clerk-user-button');
  var signInBtn = document.getElementById('btn-signin');
  var isAuthenticated = false;
  var userPlan = 'free'; // 'free' | 'pro'

  // -- Session helpers --

  function getSessionToken() {
    if (window.Clerk && window.Clerk.session) {
      return window.Clerk.session.getToken();
    }
    return Promise.resolve(null);
  }

  function isProUser() {
    return userPlan === 'pro';
  }

  function applyPlanUI() {
    var meta = window.Clerk && window.Clerk.user
      ? (window.Clerk.user.publicMetadata || {})
      : {};
    userPlan = meta.plan === 'pro' ? 'pro' : 'free';
    document.body.classList.toggle('plan-pro', userPlan === 'pro');
  }

  // -- Payment modal --

  var payModalEl = document.getElementById('pay-modal');
  var payBackdrop = document.getElementById('pay-backdrop');
  var payBtnOnetime = document.getElementById('pay-onetime');
  var payBtnSubscribe = document.getElementById('pay-subscribe');
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

  function handlePayment(mode) {
    // For subscriptions, require sign-in first
    if (mode === 'subscription' && !isAuthenticated) {
      // Open Clerk sign-in and wait for completion
      if (window.Clerk) {
        window.Clerk.openSignIn();
        // Listen for sign-in, then retry
        var _subWait = setInterval(function () {
          if (window.Clerk.user) {
            clearInterval(_subWait);
            isAuthenticated = true;
            document.body.classList.add('authenticated');
            if (clerkUserBtn) window.Clerk.mountUserButton(clerkUserBtn);
            if (signInBtn) signInBtn.style.display = 'none';
            applyPlanUI();
            // Now proceed with subscription checkout
            handlePayment(mode);
          }
        }, 500);
        setTimeout(function () { clearInterval(_subWait); }, 120000);
        return;
      }
    }

    // Save pattern state before redirecting to Stripe
    savePendingDownload();

    var origin = window.location.origin;
    var body = {
      mode: mode,
      success_url: origin + '/?payment=success',
      cancel_url: origin + '/?payment=cancelled'
    };

    getSessionToken().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      return fetch('/api/checkout', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
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
   * If user is pro subscriber → generate PDF immediately.
   * If not → show payment modal.
   */
  function requestPdfDownload(generateFn) {
    if (isProUser()) {
      generateFn();
      return;
    }
    // Store the generate function for after payment
    window._pendingPdfGenerate = generateFn;
    showPaymentModal();
  }

  // -- Bind payment modal buttons --

  if (payBtnOnetime) {
    payBtnOnetime.addEventListener('click', function () { handlePayment('payment'); });
  }
  if (payBtnSubscribe) {
    payBtnSubscribe.addEventListener('click', function () { handlePayment('subscription'); });
  }
  if (payBtnClose) {
    payBtnClose.addEventListener('click', hidePaymentModal);
  }
  if (payBackdrop) {
    payBackdrop.addEventListener('click', hidePaymentModal);
  }

  // -- Optional Clerk initialization (non-blocking) --

  function initAuth(onReady) {
    // App loads immediately — no auth gate
    onReady();

    // Initialize Clerk in background (optional sign-in)
    var checkInterval = setInterval(function () {
      if (!window.Clerk) return;
      clearInterval(checkInterval);

      window.Clerk.load().then(function () {
        if (window.Clerk.user) {
          isAuthenticated = true;
          document.body.classList.add('authenticated');
          if (clerkUserBtn) window.Clerk.mountUserButton(clerkUserBtn);
          if (signInBtn) signInBtn.style.display = 'none';
          applyPlanUI();
        }

        // Listen for sign-in/sign-out changes
        window.Clerk.addListener(function () {
          if (window.Clerk.user && !isAuthenticated) {
            isAuthenticated = true;
            document.body.classList.add('authenticated');
            if (clerkUserBtn) window.Clerk.mountUserButton(clerkUserBtn);
            if (signInBtn) signInBtn.style.display = 'none';
            applyPlanUI();
          } else if (!window.Clerk.user && isAuthenticated) {
            isAuthenticated = false;
            document.body.classList.remove('authenticated');
            if (signInBtn) signInBtn.style.display = '';
            userPlan = 'free';
            document.body.classList.remove('plan-pro');
          }
        });
      });
    }, 100);
    setTimeout(function () { clearInterval(checkInterval); }, 15000);

    // Check for payment return
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);

      // If user is logged in, refresh metadata
      if (window.Clerk && window.Clerk.user) {
        window.Clerk.user.reload().then(applyPlanUI);
      }

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
