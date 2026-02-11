// ui-modules/mobile-toolbar.js — Mobile toolbar sync, slider & button handlers

  // ============================================================
  // == Mobile Toolbar (Slider + 3 Buttons → Sheets)           ==
  // ============================================================

  // -- Sync helpers --

  function syncMobileColorStrip() {
    // Update color button swatch and name
    var color = getCurrentColor();
    var swatch = document.getElementById('mobileColorSwatch');
    var nameEl = document.getElementById('mobileColorName');
    if (swatch) swatch.style.backgroundColor = color.hex;
    if (nameEl) nameEl.textContent = color.name;
  }

  function syncMobileHeightValue(val) {
    var el = document.getElementById('mobileHeightValue');
    var slider = document.getElementById('mobileHeightSlider');
    if (el) el.textContent = val;
    if (slider) slider.value = val;
  }

  function syncMobileAidaChips() {
    var el = document.getElementById('mobileAidaValue');
    if (el) el.textContent = (isCustomAida ? Math.round(currentAida) : currentAida) + ' ct';
  }

  function syncMobileFontName() {
    var el = document.getElementById('mobileFontName');
    if (el) el.textContent = currentFontName || 'Font';
  }

  // Kept for compatibility — no longer renders dots
  function populateMobileColorStrip() {
    syncMobileColorStrip();
  }

  // -- Mobile height slider --

  var mobileSlider = document.getElementById('mobileHeightSlider');
  var mobileSliderDebounce = null;
  if (mobileSlider) {
    mobileSlider.addEventListener('input', function () {
      var val = parseInt(this.value);
      var display = document.getElementById('mobileHeightValue');
      if (display) display.textContent = val;

      // Sync desktop + sheet sliders
      heightSlider.value = val;
      heightValue.textContent = val;
      var sheetSlider = document.getElementById('sheetHeightSlider');
      var sheetValue = document.getElementById('sheetHeightValue');
      if (sheetSlider) sheetSlider.value = val;
      if (sheetValue) sheetValue.textContent = val;

      currentHeight = val;

      // Cancel stale preview requests immediately
      cancelAllPreviews();

      // Priority: re-rasterize selected font immediately
      loadAndRender();

      // Debounced: re-render sidebar previews (300ms)
      clearTimeout(mobileSliderDebounce);
      mobileSliderDebounce = setTimeout(function () {
        renderFontListUI();
      }, 300);
    });
  }

  // -- Aida button → opens settings sheet --

  var mobileAidaBtn = document.getElementById('mobileAidaBtn');
  if (mobileAidaBtn) {
    mobileAidaBtn.addEventListener('click', function () {
      openSheet('settings');
    });
  }

  // -- Font button → opens font sheet --

  var mobileFontBtn = document.getElementById('mobileFontBtn');
  if (mobileFontBtn) {
    mobileFontBtn.addEventListener('click', function () {
      openSheet('font');
    });
  }

  // -- Color button → opens color sheet --

  var mobileColorBtn = document.getElementById('mobileColorBtn');
  if (mobileColorBtn) {
    mobileColorBtn.addEventListener('click', function () {
      openSheet('color');
    });
  }

  // -- Initialize mobile toolbar on load --

  function initMobileToolbar() {
    syncMobileColorStrip();
    syncMobileHeightValue(currentHeight);
    syncMobileAidaChips();
    syncMobileFontName();
  }

  // ============================================================
  // == Resize: close sheet if transitioning to desktop         ==
  // ============================================================

  var mobileResizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(mobileResizeTimer);
    mobileResizeTimer = setTimeout(function () {
      if (!isMobile() && activeSheet) {
        closeSheet();
      }
    }, 150);
  });
