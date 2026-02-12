// ui-modules/auth.js — Authentication gate (Clerk)

  var authGate = document.getElementById('auth-gate');
  var authSignIn = document.getElementById('auth-sign-in');
  var clerkUserBtn = document.getElementById('clerk-user-button');
  var isAuthenticated = false;

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

  function showApp() {
    isAuthenticated = true;
    authGate.classList.add('auth-gate-hidden');
    document.body.classList.add('authenticated');
    if (clerkUserBtn) {
      window.Clerk.mountUserButton(clerkUserBtn);
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
