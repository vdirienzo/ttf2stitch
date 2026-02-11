// ui-modules/virtual-scroll.js — Font sheet virtual scroll & preview queue

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
      viewport.innerHTML = '';
      var msg = document.createElement('div');
      msg.style.cssText = 'padding:40px 20px;color:var(--text-muted);font-size:14px;text-align:center';
      msg.textContent = t('no_matching');
      viewport.appendChild(msg);
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
    // Use only first line for compact previews in font picker
    var text = (currentText || 'Abc').split('\n')[0] || 'Abc';
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
