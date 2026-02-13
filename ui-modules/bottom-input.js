// ui-modules/bottom-input.js — Mobile bottom input bar: sync, keyboard mode & canvas tap-to-focus

  // -- Mobile Input Bar --

  var mobileTextInput = document.getElementById('mobileTextInput');

  // Sync mobile input → state + desktop input + preview (debounced)
  var mobileInputDebounce = null;
  if (mobileTextInput) {
    mobileTextInput.addEventListener('input', function () {
      currentText = this.value;
      textInput.value = currentText;
      clearTimeout(mobileInputDebounce);
      mobileInputDebounce = setTimeout(function () {
        updatePreview();
        renderVirtualFontList();
        refreshSidebarPreviews();
      }, 300);
    });
  }

  // Sync desktop input → mobile input
  if (textInput && mobileTextInput) {
    textInput.addEventListener('input', function () {
      mobileTextInput.value = this.value;
    });
  }

  // -- Keyboard Mode: hide toolbar when typing on mobile --

  if (mobileTextInput) {
    mobileTextInput.addEventListener('focus', function () {
      document.body.classList.add('keyboard-open');
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
      if (e.target.closest('button, a, input, select, textarea')) return;

      if (isMobile() && mobileTextInput) {
        mobileTextInput.focus();
      } else if (textInput) {
        textInput.focus();
        textInput.select();
      }
    });
  }

  // -- Alignment Buttons (desktop + mobile) --

  function setAlignment(align) {
    currentAlign = align;
    // Sync all alignment button groups
    document.querySelectorAll('.align-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.align === align);
    });
    updatePreview();
  }

  // Desktop sidebar alignment
  var alignRow = document.getElementById('alignRow');
  if (alignRow) {
    alignRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.align-btn');
      if (!btn) return;
      setAlignment(btn.dataset.align);
    });
  }

  // Mobile toolbar alignment
  var mobileAlignRow = document.getElementById('mobileAlignRow');
  if (mobileAlignRow) {
    mobileAlignRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.align-btn');
      if (!btn) return;
      setAlignment(btn.dataset.align);
    });
  }

  // -- Sync on init --

  function syncMobileTextInput() {
    if (mobileTextInput) {
      mobileTextInput.value = currentText || '';
    }
  }
