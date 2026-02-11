// ui-modules/font-manager.js — Font list rendering, search, category tabs
// renderFontListUI(), font search handler, category tab click handler

  // -- Font List UI --

  function renderFontListUI() {
    var filter = (fontSearch.value || '').toLowerCase().trim();

    // Compute category counts from filtered fonts
    var categoryCounts = {};
    fontListData.forEach(function (font) {
      var name = font.name || font.file;
      if (filter && name.toLowerCase().indexOf(filter) === -1) return;
      var cat = font.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    var categories = Object.keys(categoryCounts).sort();
    var totalFiltered = 0;
    categories.forEach(function (c) { totalFiltered += categoryCounts[c]; });

    // Populate category tabs
    var tabsEl = document.getElementById('fontCategoryTabs');
    tabsEl.innerHTML = '';
    var allBtn = document.createElement('button');
    allBtn.className = 'font-tab' + (currentCategoryFilter === 'all' ? ' active' : '');
    allBtn.dataset.category = 'all';
    allBtn.textContent = t('tab_all') + ' (' + totalFiltered + ')';
    tabsEl.appendChild(allBtn);

    categories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.className = 'font-tab' + (currentCategoryFilter === cat ? ' active' : '');
      btn.dataset.category = cat;
      btn.textContent = (categoryLabels[cat] || cat) + ' (' + categoryCounts[cat] + ')';
      tabsEl.appendChild(btn);
    });

    // Reset if current category has no fonts
    if (currentCategoryFilter !== 'all' && !categoryCounts[currentCategoryFilter]) {
      currentCategoryFilter = 'all';
      tabsEl.querySelector('[data-category="all"]').classList.add('active');
    }

    // Render font list
    fontList.innerHTML = '';

    if (!fontListData.length) {
      fontList.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;text-align:center;">' + t('no_fonts') + '</div>';
      return;
    }

    var displayed = 0;
    var fragment = document.createDocumentFragment();

    fontListData.forEach(function (font) {
      var name = font.name || font.file;
      if (filter && name.toLowerCase().indexOf(filter) === -1) return;
      if (currentCategoryFilter !== 'all' && (font.category || 'other') !== currentCategoryFilter) return;

      displayed++;

      var item = document.createElement('div');
      item.className = 'font-item' + (font.file === currentFontFile ? ' selected' : '');
      item.dataset.fontFile = font.file;

      var info = document.createElement('div');
      info.className = 'font-item-info';

      var nameEl = document.createElement('div');
      nameEl.className = 'font-item-name';
      nameEl.textContent = name;

      var meta = document.createElement('div');
      meta.className = 'font-item-meta';
      var sizeKb = font.size ? (font.size / 1024).toFixed(0) + ' KB' : '';
      meta.textContent = (categoryLabels[font.category] || font.category || '') + (sizeKb ? ' \u00b7 ' + sizeKb : '');

      var previewCanvas = document.createElement('canvas');
      previewCanvas.className = 'font-item-preview';
      previewCanvas.dataset.fontFile = font.file;

      info.appendChild(nameEl);
      info.appendChild(meta);
      info.appendChild(previewCanvas);
      item.appendChild(info);
      fragment.appendChild(item);

      item.addEventListener('click', function () {
        currentFontFile = font.file;
        currentFontName = name;
        fontList.querySelectorAll('.font-item').forEach(function (el) {
          el.classList.toggle('selected', el.dataset.fontFile === font.file);
        });
        syncMobileFontName();
        loadAndRender();
      });
    });

    fontList.appendChild(fragment);

    if (!displayed) {
      fontList.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;text-align:center;">' + t('no_matching') + '</div>';
    }

    // Queue font previews for visible desktop items
    if (typeof queueFontPreview === 'function') {
      var desktopCanvases = fontList.querySelectorAll('.font-item-preview');
      for (var pi = 0; pi < desktopCanvases.length; pi++) {
        queueFontPreview(desktopCanvases[pi].dataset.fontFile, desktopCanvases[pi]);
      }
    }
  }

  // Font search filtering
  fontSearch.addEventListener('input', function () {
    renderFontListUI();
  });

  // Category tab filtering (delegated)
  document.getElementById('fontCategoryTabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.font-tab');
    if (!tab) return;
    currentCategoryFilter = tab.dataset.category;
    this.querySelectorAll('.font-tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    renderFontListUI();
  });
