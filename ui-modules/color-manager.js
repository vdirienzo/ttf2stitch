// ui-modules/color-manager.js — DMC color swatch rendering and click handlers
// renderColors(), openColorPopover(), closeColorPopover()

  // -- Color Swatches (sidebar: popular 20 + "All" button) --

  function renderColors() {
    if (typeof DMC_COLORS === 'undefined' || !DMC_COLORS.length) return;
    colorRow.innerHTML = '';
    var fragment = document.createDocumentFragment();

    var popularCodes = (typeof POPULAR_DMC_CODES !== 'undefined') ? POPULAR_DMC_CODES : [];
    var popular = popularCodes.map(function (code) {
      for (var i = 0; i < DMC_COLORS.length; i++) {
        if (DMC_COLORS[i].code === code) return DMC_COLORS[i];
      }
      return null;
    }).filter(Boolean);

    // If no popular list, show first 20
    if (!popular.length) popular = DMC_COLORS.slice(0, 20);

    popular.forEach(function (color) {
      var dot = document.createElement('div');
      dot.className = 'color-dot' + (color.code === currentColorCode ? ' selected' : '');
      dot.style.backgroundColor = color.hex;
      dot.dataset.code = color.code;

      var tip = document.createElement('div');
      tip.className = 'tip';
      tip.textContent = 'DMC ' + color.code + ' \u2014 ' + color.name;
      dot.appendChild(tip);

      fragment.appendChild(dot);
    });

    // "All colors" button
    var allBtn = document.createElement('button');
    allBtn.className = 'color-all-btn';
    allBtn.textContent = 'All\u2026';
    allBtn.setAttribute('aria-label', 'Show all DMC colors');
    fragment.appendChild(allBtn);

    colorRow.appendChild(fragment);

    // Delegated click handler for the whole color row
    colorRow.onclick = function (e) {
      var dot = e.target.closest('.color-dot');
      if (dot && dot.dataset.code) {
        selectColor(dot.dataset.code);
        return;
      }
      if (e.target.closest('.color-all-btn')) {
        openColorPopover();
      }
    };
  }

  // -- Select color by DMC code --

  function selectColor(code) {
    currentColorCode = code;

    // Update sidebar dots
    colorRow.querySelectorAll('.color-dot').forEach(function (d) {
      d.classList.toggle('selected', d.dataset.code === code);
    });

    // Update popover selection if open
    var popGrid = document.getElementById('colorPopoverGrid');
    if (popGrid) {
      popGrid.querySelectorAll('.color-dot').forEach(function (d) {
        d.classList.toggle('selected', d.dataset.code === code);
      });
    }

    syncMobileColorStrip();
    updatePreview();
  }

  // -- Desktop Color Popover --

  function openColorPopover() {
    var popover = document.getElementById('colorPopover');
    if (!popover) return;
    popover.classList.add('open');
    renderColorPopoverGrid('');

    var searchInput = document.getElementById('colorPopoverSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  function closeColorPopover() {
    var popover = document.getElementById('colorPopover');
    if (popover) popover.classList.remove('open');
  }

  function renderColorPopoverGrid(query) {
    var grid = document.getElementById('colorPopoverGrid');
    if (!grid) return;
    grid.innerHTML = '';

    var q = (query || '').toLowerCase().trim();
    var filtered = DMC_COLORS.filter(function (c) {
      if (!q) return true;
      return c.code.toLowerCase().indexOf(q) !== -1 || c.name.toLowerCase().indexOf(q) !== -1;
    });

    var fragment = document.createDocumentFragment();
    filtered.forEach(function (color) {
      var dot = document.createElement('div');
      dot.className = 'color-dot' + (color.code === currentColorCode ? ' selected' : '');
      dot.style.backgroundColor = color.hex;
      dot.dataset.code = color.code;

      var tip = document.createElement('div');
      tip.className = 'tip';
      tip.textContent = 'DMC ' + color.code + ' \u2014 ' + color.name;
      dot.appendChild(tip);

      fragment.appendChild(dot);
    });

    grid.appendChild(fragment);
  }

  // Popover event wiring (delegated)
  var colorPopover = document.getElementById('colorPopover');
  if (colorPopover) {
    // Grid click
    var popGrid = document.getElementById('colorPopoverGrid');
    if (popGrid) {
      popGrid.onclick = function (e) {
        var dot = e.target.closest('.color-dot');
        if (dot && dot.dataset.code) {
          selectColor(dot.dataset.code);
          closeColorPopover();
        }
      };
    }

    // Search input
    var popSearch = document.getElementById('colorPopoverSearch');
    if (popSearch) {
      popSearch.addEventListener('input', function () {
        renderColorPopoverGrid(this.value);
      });
    }

    // Close button
    var popClose = document.getElementById('colorPopoverClose');
    if (popClose) {
      popClose.addEventListener('click', closeColorPopover);
    }

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (colorPopover.classList.contains('open') && !colorPopover.contains(e.target) && !e.target.closest('.color-all-btn')) {
        closeColorPopover();
      }
    });
  }
