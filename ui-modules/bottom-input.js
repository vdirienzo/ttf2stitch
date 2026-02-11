// ui-modules/bottom-input.js — Mobile bottom input bar: sync & canvas tap-to-focus

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
    // Patch existing input handler to also sync mobile input
    textInput.addEventListener('input', function () {
      mobileTextInput.value = this.value;
    });
  }

  // -- Canvas / Preview Tap → Focus Mobile Input --

  var previewAreaEl = document.getElementById('previewArea');
  if (previewAreaEl && mobileTextInput) {
    previewAreaEl.addEventListener('click', function (e) {
      // Only on mobile, and only if not clicking on an interactive child
      if (!isMobile()) return;
      if (e.target.closest('button, a, input, select')) return;

      mobileTextInput.focus();
      // Scroll into view smoothly to ensure visibility
      mobileTextInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

  }

  // -- Sync on init: ensure mobile input has current text --

  function syncMobileTextInput() {
    if (mobileTextInput) {
      mobileTextInput.value = currentText || '';
    }
  }
