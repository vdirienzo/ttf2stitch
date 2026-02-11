// ui-modules/settings.js — Stitch/aida/height/unit handlers and custom stitch variables
// Height slider, aida count buttons, custom stitch slider, unit toggle

  // -- Height Slider --

  var heightDebounceTimer = null;

  heightSlider.addEventListener('input', function () {
    var val = parseInt(this.value);
    heightValue.textContent = val;
    syncMobileHeightValue(val);
    currentHeight = val;

    // Cancel stale preview requests immediately
    cancelAllPreviews();

    // Priority: re-rasterize selected font immediately
    loadAndRender();

    // Debounced: re-render sidebar previews (300ms)
    clearTimeout(heightDebounceTimer);
    heightDebounceTimer = setTimeout(function () {
      renderFontListUI();
    }, 300);
  });

  // -- Aida Count --

  document.getElementById('langSelect').addEventListener('change', function() {
    setLanguage(this.value);
  });

  var customStitchRow = document.getElementById('customStitchRow');
  var customStitchSlider = document.getElementById('customStitchSlider');
  var customStitchValue = document.getElementById('customStitchValue');
  var customStitchEquiv = document.getElementById('customStitchEquiv');
  var currentStitchMm = 3.0; // default 3mm stitch length
  var isCustomAida = false;

  function stitchMmToAida(mm) {
    return 25.4 / mm; // 25.4mm per inch
  }

  // Format stitch length + equivalence respecting displayUnit
  function formatStitchDisplay(mm) {
    var isImperial = (displayUnit === 'imperial');
    var displayVal, unit, equiv;
    if (isImperial) {
      displayVal = (mm / 25.4).toFixed(2);  // mm → inches
      unit = 'in';
      equiv = '\u2248 ' + (25.4 / mm).toFixed(1) + ' stitches/in';
    } else {
      displayVal = mm.toFixed(1);
      unit = 'mm';
      equiv = '\u2248 ' + (10 / mm).toFixed(1) + ' stitches/cm';
    }
    return { value: displayVal, unit: unit, equiv: equiv };
  }

  function updateCustomStitch(mm, source) {
    currentStitchMm = mm;
    var aida = stitchMmToAida(mm);
    currentAida = aida;

    var fmt = formatStitchDisplay(mm);

    // Update desktop UI
    if (customStitchValue) customStitchValue.textContent = fmt.value;
    if (customStitchSlider && source !== 'desktop') customStitchSlider.value = mm;
    if (customStitchEquiv) customStitchEquiv.textContent = fmt.equiv;
    var dUnit = document.getElementById('customStitchUnit');
    if (dUnit) dUnit.textContent = fmt.unit;

    // Update sheet UI
    var sheetVal = document.getElementById('sheetCustomStitchValue');
    var sheetSlider = document.getElementById('sheetCustomStitchSlider');
    var sheetEquiv = document.getElementById('sheetCustomStitchEquiv');
    var sheetUnit = document.getElementById('sheetCustomStitchUnit');
    if (sheetVal) sheetVal.textContent = fmt.value;
    if (sheetSlider && source !== 'sheet') sheetSlider.value = mm;
    if (sheetEquiv) sheetEquiv.textContent = fmt.equiv;
    if (sheetUnit) sheetUnit.textContent = fmt.unit;

    syncMobileAidaChips();
    updatePreview();
  }

  aidaRow.addEventListener('click', function (e) {
    var chip = e.target.closest('.aida-chip');
    if (!chip) return;
    var countVal = chip.dataset.count;

    // Deselect all chips
    aidaRow.querySelectorAll('.aida-chip').forEach(function (c) {
      c.classList.remove('selected');
    });
    chip.classList.add('selected');

    if (countVal === 'custom') {
      if (isCustomAida) {
        // Already custom — toggle slider visibility
        if (customStitchRow) customStitchRow.classList.toggle('visible');
      } else {
        isCustomAida = true;
        if (customStitchRow) customStitchRow.classList.add('visible');
        updateCustomStitch(currentStitchMm, 'init');
      }
    } else {
      isCustomAida = false;
      if (customStitchRow) customStitchRow.classList.remove('visible');
      currentAida = parseInt(countVal);
      syncMobileAidaChips();
      updatePreview();
    }
  });

  // Desktop stitch slider
  if (customStitchSlider) {
    customStitchSlider.addEventListener('input', function () {
      if (isCustomAida) updateCustomStitch(parseFloat(this.value), 'desktop');
    });
  }

  // -- Global unit toggle (cm / in) --
  document.getElementById('unitToggle').addEventListener('click', function (e) {
    var btn = e.target.closest('.unit-toggle-btn');
    if (!btn || btn.classList.contains('active')) return;
    setDisplayUnit(btn.dataset.unit);
  });
