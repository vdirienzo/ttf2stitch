// ui-modules/mobile-ui.js — Mobile sheets, virtual scroll, toolbar

  // ============================================================
  // == Mobile Canvas First: Bottom Sheets & Virtual Scroll     ==
  // ============================================================

  var isMobile = function () { return window.innerWidth <= 640; };

  // -- Sheet State --
  var activeSheet = null;
  var sheetBackdrop = document.getElementById('sheetBackdrop');
  var mobileToolbar = document.getElementById('mobileToolbar');
  var sheets = {
    font: document.getElementById('sheetFont'),
    color: document.getElementById('sheetColor'),
    settings: document.getElementById('sheetSettings'),
    info: document.getElementById('sheetInfo')
  };

  // -- Sheet Open / Close --
  function openSheet(name) {
    if (!isMobile()) return;
    if (activeSheet === name) {
      closeSheet();
      return;
    }
    // Close any open sheet first (no animation, instant)
    if (activeSheet) {
      sheets[activeSheet].classList.remove('open');
    }
    activeSheet = name;
    var sheet = sheets[name];
    if (!sheet) return;

    // Populate sheet content before opening
    if (name === 'font') populateFontSheet();
    if (name === 'color') populateColorSheet();
    if (name === 'settings') syncSettingsSheet();
    if (name === 'info') syncInfoSheet();

    sheetBackdrop.classList.add('visible');
    sheet.classList.add('open');
    document.body.classList.add('sheet-open');
    sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    if (!activeSheet) return;
    var sheet = sheets[activeSheet];
    if (sheet) {
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
    }
    sheetBackdrop.classList.remove('visible');
    document.body.classList.remove('sheet-open');
    activeSheet = null;
  }

  // Backdrop click closes sheet
  sheetBackdrop.addEventListener('click', closeSheet);

  // Escape key closes sheet
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeSheet) closeSheet();
  });

  // ============================================================
  // == Swipe-to-Dismiss on Sheet Handles                       ==
  // ============================================================

  function initSheetDrag(handleId, sheetId) {
    var handle = document.getElementById(handleId);
    var sheet = document.getElementById(sheetId);
    if (!handle || !sheet) return;

    var startY = 0, currentY = 0, startTime = 0, isDragging = false;

    handle.addEventListener('touchstart', function (e) {
      if (!sheet.classList.contains('open')) return;
      isDragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      startTime = Date.now();
      sheet.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', function (e) {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      var dy = Math.max(0, currentY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });

    handle.addEventListener('touchend', function () {
      if (!isDragging) return;
      isDragging = false;
      sheet.style.transition = '';
      var dy = currentY - startY;
      var dt = Date.now() - startTime;
      var velocity = dy / Math.max(dt, 1);

      if (dy > 120 || velocity > 0.5) {
        closeSheet();
      } else {
        sheet.style.transform = '';
      }
    });
  }

  initSheetDrag('sheetFontHandle', 'sheetFont');
  initSheetDrag('sheetColorHandle', 'sheetColor');
  initSheetDrag('sheetSettingsHandle', 'sheetSettings');
  initSheetDrag('sheetInfoHandle', 'sheetInfo');

  // ============================================================
  // == Font Sheet: Virtual Scroll                              ==
  // ============================================================

  var FONT_ITEM_HEIGHT = 80;
  var OVERSCAN = 5;
  var fontSheetFilter = '';
  var fontSheetCategory = 'all';
  var filteredFontsCache = [];

  function getFilteredFonts() {
    var filter = fontSheetFilter.toLowerCase().trim();
    return fontListData.filter(function (font) {
      var name = (font.name || font.file).toLowerCase();
      if (filter && name.indexOf(filter) === -1) return false;
      if (fontSheetCategory !== 'all' && (font.category || 'other') !== fontSheetCategory) return false;
      return true;
    });
  }

  function populateFontSheet() {
    // Build tabs
    var tabsEl = document.getElementById('sheetFontTabs');
    var filter = fontSheetFilter.toLowerCase().trim();
    var categoryCounts = {};
    fontListData.forEach(function (font) {
      var name = (font.name || font.file).toLowerCase();
      if (filter && name.indexOf(filter) === -1) return;
      var cat = font.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    var categories = Object.keys(categoryCounts).sort();
    var total = 0;
    categories.forEach(function (c) { total += categoryCounts[c]; });

    tabsEl.innerHTML = '';
    var allTab = document.createElement('button');
    allTab.className = 'font-tab' + (fontSheetCategory === 'all' ? ' active' : '');
    allTab.dataset.category = 'all';
    allTab.textContent = t('tab_all') + ' (' + total + ')';
    tabsEl.appendChild(allTab);

    categories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.className = 'font-tab' + (fontSheetCategory === cat ? ' active' : '');
      btn.dataset.category = cat;
      btn.textContent = (categoryLabels[cat] || cat) + ' (' + categoryCounts[cat] + ')';
      tabsEl.appendChild(btn);
    });

    // Reset category if invalid
    if (fontSheetCategory !== 'all' && !categoryCounts[fontSheetCategory]) {
      fontSheetCategory = 'all';
    }

    // Update filtered cache
    filteredFontsCache = getFilteredFonts();

    // Set viewport total height
    var viewport = document.getElementById('sheetFontListViewport');
    viewport.style.height = (filteredFontsCache.length * FONT_ITEM_HEIGHT) + 'px';

    // Trigger initial render
    renderVirtualFontList();
  }

  var rafPending = false;

  function renderVirtualFontList() {
    var wrap = document.getElementById('sheetFontListWrap');
    var viewport = document.getElementById('sheetFontListViewport');
    if (!wrap || !viewport) return;

    var scrollTop = wrap.scrollTop;
    var viewportHeight = wrap.clientHeight;
    var totalItems = filteredFontsCache.length;

    if (!totalItems) {
      viewport.innerHTML = '<div style="padding:40px 20px;color:var(--text-muted);font-size:14px;text-align:center;">' + t('no_matching') + '</div>';
      viewport.style.height = 'auto';
      return;
    }

    var startIndex = Math.max(0, Math.floor(scrollTop / FONT_ITEM_HEIGHT) - OVERSCAN);
    var endIndex = Math.min(totalItems, Math.ceil((scrollTop + viewportHeight) / FONT_ITEM_HEIGHT) + OVERSCAN);

    var fragment = document.createDocumentFragment();

    // Top spacer
    if (startIndex > 0) {
      var topSpacer = document.createElement('div');
      topSpacer.style.height = (startIndex * FONT_ITEM_HEIGHT) + 'px';
      fragment.appendChild(topSpacer);
    }

    for (var i = startIndex; i < endIndex; i++) {
      var font = filteredFontsCache[i];
      var name = font.name || font.file;

      var item = document.createElement('div');
      item.className = 'sheet-font-item' + (font.file === currentFontFile ? ' selected' : '');
      item.dataset.fontFile = font.file;
      item.dataset.fontIndex = i;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', font.file === currentFontFile ? 'true' : 'false');

      var info = document.createElement('div');
      info.className = 'sheet-font-item-info';

      var nameEl = document.createElement('div');
      nameEl.className = 'sheet-font-item-name';
      nameEl.textContent = name;

      var meta = document.createElement('div');
      meta.className = 'sheet-font-item-meta';
      meta.textContent = categoryLabels[font.category] || font.category || '';

      var previewCanvas = document.createElement('canvas');
      previewCanvas.className = 'sheet-font-item-preview';
      previewCanvas.dataset.fontFile = font.file;

      info.appendChild(nameEl);
      info.appendChild(meta);
      info.appendChild(previewCanvas);
      item.appendChild(info);

      // Checkmark
      var check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      check.setAttribute('class', 'sheet-font-item-check');
      check.setAttribute('viewBox', '0 0 24 24');
      check.setAttribute('fill', 'none');
      check.setAttribute('stroke', 'currentColor');
      check.setAttribute('stroke-width', '3');
      check.setAttribute('stroke-linecap', 'round');
      check.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', '20 6 9 17 4 12');
      check.appendChild(path);
      item.appendChild(check);

      fragment.appendChild(item);
    }

    // Bottom spacer
    var bottomHeight = (totalItems - endIndex) * FONT_ITEM_HEIGHT;
    if (bottomHeight > 0) {
      var bottomSpacer = document.createElement('div');
      bottomSpacer.style.height = bottomHeight + 'px';
      fragment.appendChild(bottomSpacer);
    }

    previewQueue = [];
    viewport.innerHTML = '';
    viewport.appendChild(fragment);
    viewport.style.height = ''; // let spacers define height

    // Queue font previews for visible items
    var canvases = viewport.querySelectorAll('.sheet-font-item-preview');
    for (var ci = 0; ci < canvases.length; ci++) {
      queueFontPreview(canvases[ci].dataset.fontFile, canvases[ci]);
    }
  }

  // -- Font Preview Queue --
  var previewQueue = [];
  var activePreviewRequests = 0;
  var MAX_PREVIEW_CONCURRENT = 3;

  function cancelAllPreviews() {
    previewAbortControllers.forEach(function (ctrl) { ctrl.abort(); });
    previewAbortControllers.clear();
    previewQueue = [];
    activePreviewRequests = 0;
  }

  function queueFontPreview(fontFile, canvasEl) {
    var cacheKey = getCacheKey(fontFile, currentHeight);
    if (fontCache.has(cacheKey)) {
      renderFontPreviewCanvas(canvasEl, fontCache.get(cacheKey));
      return;
    }
    canvasEl.classList.add('loading');
    previewQueue.push({ fontFile: fontFile, canvas: canvasEl, height: currentHeight });
    processPreviewQueue();
  }

  function processPreviewQueue() {
    while (activePreviewRequests < MAX_PREVIEW_CONCURRENT && previewQueue.length > 0) {
      var job = previewQueue.shift();
      if (!document.contains(job.canvas)) continue;
      var cacheKey = getCacheKey(job.fontFile, job.height);
      if (fontCache.has(cacheKey)) {
        renderFontPreviewCanvas(job.canvas, fontCache.get(cacheKey));
        job.canvas.classList.remove('loading');
        continue;
      }
      activePreviewRequests++;
      rasterizeFontForPreview(job);
    }
  }

  function rasterizeFontForPreview(job) {
    var cacheKey = getCacheKey(job.fontFile, job.height);
    var controller = new AbortController();
    previewAbortControllers.set(cacheKey, controller);

    fetch('/api/rasterize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ font: job.fontFile, height: job.height, bold: 0, strategy: 'average' }),
      signal: controller.signal
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      fontCache.set(cacheKey, data);
      if (document.contains(job.canvas)) {
        renderFontPreviewCanvas(job.canvas, data);
        job.canvas.classList.remove('loading');
      }
    })
    .catch(function(err) {
      if (err.name === 'AbortError') return; // Silently ignore aborted requests
      if (document.contains(job.canvas)) job.canvas.classList.remove('loading');
    })
    .finally(function() {
      previewAbortControllers.delete(cacheKey);
      activePreviewRequests--;
      processPreviewQueue();
    });
  }

  function renderFontPreviewCanvas(canvas, fontData) {
    var text = currentText || 'Abc';
    var color = getCurrentColor().hex;
    renderPreview(canvas, text, fontData, color, { cellSize: 2, maxWidth: 260 });
  }

  // Scroll handler (RAF-throttled)
  var sheetFontListWrap = document.getElementById('sheetFontListWrap');
  if (sheetFontListWrap) {
    sheetFontListWrap.addEventListener('scroll', function () {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        renderVirtualFontList();
      });
    }, { passive: true });
  }

  // Font sheet: item click (delegated)
  var sheetFontListViewport = document.getElementById('sheetFontListViewport');
  if (sheetFontListViewport) {
    sheetFontListViewport.addEventListener('click', function (e) {
      var item = e.target.closest('.sheet-font-item');
      if (!item) return;
      var fontFile = item.dataset.fontFile;
      var font = fontListData.find(function (f) { return f.file === fontFile; });
      if (!font) return;

      currentFontFile = font.file;
      currentFontName = font.name || font.file;

      // Update desktop sidebar selection too
      fontList.querySelectorAll('.font-item').forEach(function (el) {
        el.classList.toggle('selected', el.dataset.fontFile === font.file);
      });

      syncMobileFontName();
      loadAndRender();

      // Re-render virtual list to update selection
      renderVirtualFontList();

      // Close sheet after brief delay
      setTimeout(closeSheet, 200);
    });
  }

  // Font sheet: search
  var sheetFontSearchInput = document.getElementById('sheetFontSearch');
  var fontSearchDebounce = null;
  if (sheetFontSearchInput) {
    sheetFontSearchInput.addEventListener('input', function () {
      clearTimeout(fontSearchDebounce);
      fontSearchDebounce = setTimeout(function () {
        fontSheetFilter = sheetFontSearchInput.value;
        filteredFontsCache = getFilteredFonts();
        var viewport = document.getElementById('sheetFontListViewport');
        if (viewport) viewport.style.height = (filteredFontsCache.length * FONT_ITEM_HEIGHT) + 'px';
        var wrap = document.getElementById('sheetFontListWrap');
        if (wrap) wrap.scrollTop = 0;
        populateFontSheet();
      }, 150);
    });
  }

  // Font sheet: category tabs (delegated)
  var sheetFontTabs = document.getElementById('sheetFontTabs');
  if (sheetFontTabs) {
    sheetFontTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.font-tab');
      if (!tab) return;
      fontSheetCategory = tab.dataset.category;
      // Also sync desktop sidebar
      currentCategoryFilter = fontSheetCategory;
      populateFontSheet();
      renderFontListUI();
    });
  }

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
