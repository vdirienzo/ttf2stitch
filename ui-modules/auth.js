// ui-modules/auth.js — Authentication gate + plan management (Clerk + Stripe)

  var authGate = document.getElementById('auth-gate');
  var authSignIn = document.getElementById('auth-sign-in');
  var clerkUserBtn = document.getElementById('clerk-user-button');
  var upgradeBtn = document.getElementById('btn-upgrade');
  var proBadge = document.getElementById('pro-badge');
  var isAuthenticated = false;
  var userPlan = 'free'; // 'free' | 'pro'

  /**
   * Returns the current session JWT token (Promise<string|null>).
   * Called by api.js to attach Authorization header.
   */
  function getSessionToken() {
    if (window.Clerk && window.Clerk.session) {
      return window.Clerk.session.getToken();
    }
    return Promise.resolve(null);
  }

  function getUserPlan() {
    return userPlan;
  }

  function isProUser() {
    return userPlan === 'pro';
  }

  function applyPlanUI() {
    var meta = window.Clerk && window.Clerk.user
      ? (window.Clerk.user.publicMetadata || {})
      : {};
    userPlan = meta.plan === 'pro' ? 'pro' : 'free';

    if (upgradeBtn) upgradeBtn.style.display = userPlan === 'pro' ? 'none' : '';
    if (proBadge) proBadge.style.display = userPlan === 'pro' ? '' : 'none';
    document.body.classList.toggle('plan-pro', userPlan === 'pro');
  }

  function handleUpgrade() {
    if (!upgradeBtn) return;
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = 'Loading…';

    var origin = window.location.origin;
    getSessionToken().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      return fetch('/api/checkout', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          success_url: origin + '/?payment=success',
          cancel_url: origin + '/?payment=cancelled'
        })
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
      upgradeBtn.disabled = false;
      upgradeBtn.textContent = 'Upgrade to Pro';
    });
  }

  function showApp() {
    isAuthenticated = true;
    authGate.classList.add('auth-gate-hidden');
    document.body.classList.add('authenticated');
    if (clerkUserBtn) {
      window.Clerk.mountUserButton(clerkUserBtn);
    }
    applyPlanUI();

    // Bind upgrade button
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', handleUpgrade);
    }

    // Check for payment return
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      // Refresh user data to pick up new plan metadata
      window.Clerk.user.reload().then(applyPlanUI);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  /**
   * Wait for Clerk.session to be fully ready (has getToken method),
   * then call the callback. Clerk.user can exist before session is populated.
   */
  function waitForSession(callback) {
    if (window.Clerk.session && window.Clerk.session.getToken) {
      callback();
      return;
    }
    // Poll until session is ready (usually 50-200ms after Clerk.load)
    var sessionCheck = setInterval(function () {
      if (window.Clerk.session && window.Clerk.session.getToken) {
        clearInterval(sessionCheck);
        callback();
      }
    }, 50);
    setTimeout(function () { clearInterval(sessionCheck); }, 10000);
  }

  /**
   * Initialize Clerk auth: wait for ClerkJS async script,
   * then check session and either show app or mount sign-in.
   * @param {Function} onReady — called once user is authenticated (triggers init)
   */
  function initAuth(onReady) {
    var attempts = 0;
    var maxAttempts = 150; // 15 seconds at 100ms intervals

    var checkInterval = setInterval(function () {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(checkInterval);
        // Clerk failed to load — show error in auth gate
        if (authSignIn) {
          authSignIn.innerHTML =
            '<p style="color:#e74c3c;text-align:center;padding:20px;">' +
            'Authentication service unavailable. Please refresh the page.</p>';
        }
        return;
      }

      if (!window.Clerk) return;
      clearInterval(checkInterval);

      window.Clerk.load().then(function () {
        if (window.Clerk.user) {
          showApp();
          // Wait for session to be fully populated before calling init
          waitForSession(onReady);
        } else {
          // Mount Clerk's sign-in component
          authGate.classList.remove('auth-gate-hidden');
          window.Clerk.mountSignIn(authSignIn, {
            appearance: {
              variables: {
                colorPrimary: '#c0392b'
              }
            }
          });

          // Listen for successful sign-in
          window.Clerk.addListener(function () {
            if (window.Clerk.user && !isAuthenticated) {
              showApp();
              waitForSession(onReady);
            }
          });
        }
      });
    }, 100);
  }
