// ui-modules/bottom-input.js — Mobile bottom input bar: sync, keyboard mode & canvas tap-to-focus

  // -- Mobile Input Bar --

  var mobileTextInput = document.getElementById('mobileTextInput');

  // Sync mobile input → state + desktop input + preview
  if (mobileTextInput) {
    mobileTextInput.addEventListener('input', function () {
      currentText = this.value;
      textInput.value = currentText;
      updatePreview();
      renderVirtualFontList();
    });
  }

  // Sync desktop input → mobile input (keep in sync when typing on desktop)
  if (textInput && mobileTextInput) {
    textInput.addEventListener('input', function () {
      mobileTextInput.value = this.value;
    });
  }

  // -- Keyboard Mode: hide toolbar when typing on mobile --

  if (mobileTextInput) {
    mobileTextInput.addEventListener('focus', function () {
      document.body.classList.add('keyboard-open');
      // After layout shift, re-check preview fits
      setTimeout(updatePreview, 100);
    });

    mobileTextInput.addEventListener('blur', function () {
      document.body.classList.remove('keyboard-open');
      setTimeout(updatePreview, 100);
    });
  }

  // -- Canvas / Preview Tap → Focus Input (mobile + desktop) --

  var previewAreaEl = document.getElementById('previewArea');
  if (previewAreaEl) {
    previewAreaEl.addEventListener('click', function (e) {
      if (e.target.closest('button, a, input, select')) return;

      if (isMobile() && mobileTextInput) {
        mobileTextInput.focus();
      } else if (textInput) {
        textInput.focus();
        textInput.select();
      }
    });
  }

  // -- Sync on init: ensure mobile input has current text --

  function syncMobileTextInput() {
    if (mobileTextInput) {
      mobileTextInput.value = currentText || '';
    }
  }
