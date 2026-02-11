// ui-modules/sheet-content.js — Color, Settings & Info sheet content

  // ============================================================
  // == Color Sheet                                             ==
  // ============================================================

  function populateColorSheet() {
    if (typeof DMC_COLORS === 'undefined' || !DMC_COLORS.length) return;

    var color = getCurrentColor();
    var swatch = document.getElementById('sheetColorSwatch');
    var nameEl = document.getElementById('sheetColorName');
    var codeEl = document.getElementById('sheetColorCode');
    if (swatch) swatch.style.backgroundColor = color.hex;
    if (nameEl) nameEl.textContent = color.name;
    if (codeEl) codeEl.textContent = 'DMC ' + color.code;

    var grid = document.getElementById('sheetColorGrid');
    if (!grid) return;
    grid.innerHTML = '';

    DMC_COLORS.forEach(function (c, index) {
      var dot = document.createElement('div');
      dot.className = 'color-dot' + (index === currentColorIndex ? ' selected' : '');
      dot.style.backgroundColor = c.hex;
      dot.dataset.index = index;

      dot.addEventListener('click', function () {
        currentColorIndex = index;

        // Update desktop sidebar
        colorRow.querySelectorAll('.color-dot').forEach(function (d) {
          d.classList.toggle('selected', parseInt(d.dataset.index) === index);
        });

        // Sync mobile color strip
        syncMobileColorStrip();

        // Update this sheet
        populateColorSheet();
        updatePreview();
      });

      grid.appendChild(dot);
    });
  }

  // ============================================================
  // == Settings Sheet                                          ==
  // ============================================================

  function syncSettingsSheet() {
    var sheetSlider = document.getElementById('sheetHeightSlider');
    var sheetValue = document.getElementById('sheetHeightValue');
    if (sheetSlider) sheetSlider.value = currentHeight;
    if (sheetValue) sheetValue.textContent = currentHeight;

    // Sync aida selection
    var sheetAidaRow = document.getElementById('sheetAidaRow');
    if (sheetAidaRow) {
      sheetAidaRow.querySelectorAll('.aida-chip').forEach(function (chip) {
        var count = chip.dataset.count;
        if (count === 'custom') {
          chip.classList.toggle('selected', isCustomAida);
        } else {
          chip.classList.toggle('selected', !isCustomAida && parseInt(count) === currentAida);
        }
      });
    }

    var sheetCustomRow = document.getElementById('sheetCustomStitchRow');
    if (sheetCustomRow) {
      sheetCustomRow.classList.toggle('visible', isCustomAida);
      if (isCustomAida) {
        var fmt = formatStitchDisplay(currentStitchMm);
        var sv = document.getElementById('sheetCustomStitchValue');
        var ss = document.getElementById('sheetCustomStitchSlider');
        var se = document.getElementById('sheetCustomStitchEquiv');
        var su = document.getElementById('sheetCustomStitchUnit');
        if (sv) sv.textContent = fmt.value;
        if (ss) ss.value = currentStitchMm;
        if (se) se.textContent = fmt.equiv;
        if (su) su.textContent = fmt.unit;
      }
    }
  }

  // Settings sheet: height slider
  var sheetHeightSlider = document.getElementById('sheetHeightSlider');
  var sheetHeightDebounce = null;
  if (sheetHeightSlider) {
    sheetHeightSlider.addEventListener('input', function () {
      var val = parseInt(this.value);
      var sheetValue = document.getElementById('sheetHeightValue');
      if (sheetValue) sheetValue.textContent = val;

      // Sync desktop slider + mobile slider
      heightSlider.value = val;
      heightValue.textContent = val;
      syncMobileHeightValue(val);

      currentHeight = val;

      // Cancel stale preview requests immediately
      cancelAllPreviews();

      // Priority: re-rasterize selected font immediately
      loadAndRender();

      // Debounced: re-render sidebar previews (300ms)
      clearTimeout(sheetHeightDebounce);
      sheetHeightDebounce = setTimeout(function () {
        renderFontListUI();
      }, 300);
    });
  }

  // Settings sheet: aida chips
  var sheetAidaRow = document.getElementById('sheetAidaRow');
  if (sheetAidaRow) {
    sheetAidaRow.addEventListener('click', function (e) {
      var chip = e.target.closest('.aida-chip');
      if (!chip) return;
      var countVal = chip.dataset.count;

      // Deselect all in sheet
      sheetAidaRow.querySelectorAll('.aida-chip').forEach(function (c) { c.classList.remove('selected'); });
      chip.classList.add('selected');

      // Sync desktop
      aidaRow.querySelectorAll('.aida-chip').forEach(function (c) { c.classList.remove('selected'); });
      var desktopChip = aidaRow.querySelector('[data-count="' + countVal + '"]');
      if (desktopChip) desktopChip.classList.add('selected');

      var sheetCustomRow = document.getElementById('sheetCustomStitchRow');

      if (countVal === 'custom') {
        isCustomAida = true;
        if (customStitchRow) customStitchRow.classList.add('visible');
        if (sheetCustomRow) sheetCustomRow.classList.add('visible');
        updateCustomStitch(currentStitchMm, 'init');
      } else {
        isCustomAida = false;
        if (customStitchRow) customStitchRow.classList.remove('visible');
        if (sheetCustomRow) sheetCustomRow.classList.remove('visible');
        currentAida = parseInt(countVal);
        syncMobileAidaChips();
        updatePreview();
      }
    });
  }

  // Settings sheet: stitch length slider
  var sheetStitchSlider = document.getElementById('sheetCustomStitchSlider');
  if (sheetStitchSlider) {
    sheetStitchSlider.addEventListener('input', function () {
      if (isCustomAida) updateCustomStitch(parseFloat(this.value), 'sheet');
    });
  }

  // ============================================================
  // == Info Sheet                                              ==
  // ============================================================

  function syncInfoSheet() {
    var color = getCurrentColor();
    var sizeCm = document.getElementById('statSizeCm');
    var stitchW = document.getElementById('statStitchesW');
    var stitchH = document.getElementById('statStitchesH');
    var total = document.getElementById('statTotal');
    var dmc = document.getElementById('statDmc');
    var thread = document.getElementById('statThread');

    var infoSize = document.getElementById('infoSize');
    var infoStitches = document.getElementById('infoStitches');
    var infoCrosses = document.getElementById('infoCrosses');
    var infoDmc = document.getElementById('infoDmc');
    var infoThread = document.getElementById('infoThread');
    var infoRulerW = document.getElementById('infoRulerWidth');

    if (infoSize && sizeCm) infoSize.textContent = sizeCm.textContent || '-- x --';
    if (infoStitches && stitchW && stitchH) infoStitches.textContent = (stitchW.textContent || '--') + 'x' + (stitchH.textContent || '--');
    if (infoCrosses && total) infoCrosses.textContent = total.textContent || '--';
    if (infoDmc && dmc) infoDmc.textContent = dmc.textContent || '--';
    if (infoThread && thread) infoThread.textContent = thread.textContent || '--';
    // Sync unit label
    var infoSizeUnit = document.getElementById('infoSizeUnit');
    var statSizeUnit = document.getElementById('statSizeUnit');
    if (infoSizeUnit && statSizeUnit) infoSizeUnit.textContent = statSizeUnit.textContent;
    if (infoRulerW) {
      var rulerW = document.getElementById('rulerWidth');
      infoRulerW.textContent = rulerW ? rulerW.textContent : '--';
    }

    // Sync language selector
    var sheetLang = document.getElementById('sheetLangSelect');
    if (sheetLang) sheetLang.value = currentLang;
  }

  // Info sheet: language selector
  var sheetLangSelect = document.getElementById('sheetLangSelect');
  if (sheetLangSelect) {
    sheetLangSelect.addEventListener('change', function () {
      setLanguage(this.value);
      // Sync desktop selector
      var desktopSelect = document.getElementById('langSelect');
      if (desktopSelect) desktopSelect.value = this.value;
    });
  }
