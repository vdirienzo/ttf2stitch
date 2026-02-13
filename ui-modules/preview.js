// ui-modules/preview.js — Preview orchestration
// updatePreview(), loadAndRender(), text input handler

  // -- Update Preview (main function) --

  function updatePreview() {
    var color = getCurrentColor();

    if (!currentText.trim() || !currentFontData) {
      previewEmpty.style.display = 'flex';
      previewWrap.style.display = 'none';
      return;
    }

    previewEmpty.style.display = 'none';
    previewWrap.style.display = 'flex';

    // Calculate available space
    var areaRect = previewArea.getBoundingClientRect();
    var maxW = areaRect.width - 40;

    var result = renderPreview(mainCanvas, currentText, currentFontData, color.hex, {
      cellSize: 16,
      maxWidth: maxW,
      textAlign: currentAlign
    });

    if (result.width === 0) {
      previewEmpty.style.display = 'flex';
      previewWrap.style.display = 'none';
      return;
    }

    // Calculate physical size using unit-aware helpers
    var size = formatSize(result.width, result.height, currentAida);

    // Update stats
    var statsBar = document.getElementById('statsBar');
    if (statsBar && !statsBar.getAttribute('aria-live')) {
      statsBar.setAttribute('aria-live', 'polite');
      statsBar.setAttribute('aria-atomic', 'true');
    }
    document.getElementById('statSizeCm').textContent = size.value;
    var sizeUnitEl = document.getElementById('statSizeUnit');
    if (sizeUnitEl) sizeUnitEl.textContent = size.unit;
    document.getElementById('statStitchesW').textContent = result.width;
    document.getElementById('statStitchesH').textContent = result.height;
    document.getElementById('statTotal').textContent = result.stitches;
    document.getElementById('statDmc').textContent = color.code;

    // Thread estimate
    document.getElementById('statThread').textContent = formatThread(result.stitches, currentAida);

    // Ruler: match canvas rendered dimensions
    document.getElementById('rulerWidth').textContent = size.width;
    var rulerHeightLabel = document.getElementById('rulerHeight');
    if (rulerHeightLabel) rulerHeightLabel.textContent = size.height;
    requestAnimationFrame(function () {
      var canvasRect = mainCanvas.getBoundingClientRect();
      var rulerLine = document.querySelector('.ruler-line');
      if (rulerLine && canvasRect.width > 0) {
        rulerLine.style.width = canvasRect.width + 'px';
      }
      // Vertical ruler: match canvas rendered height
      var rulerV = document.getElementById('rulerVertical');
      if (rulerV && canvasRect.height > 0) {
        rulerV.style.height = canvasRect.height + 'px';
      }
    });
  }

  // -- Trigger rasterization and update --

  function loadAndRender() {
    if (!currentFontFile) {
      currentFontData = null;
      updatePreview();
      return;
    }

    rasterizeFont(currentFontFile, currentHeight).then(function (data) {
      if (data) {
        currentFontData = data;
      }
      updatePreview();
    });
  }

  // -- Text Input --

  var desktopInputDebounce = null;
  textInput.addEventListener('input', function () {
    currentText = this.value;
    clearTimeout(desktopInputDebounce);
    desktopInputDebounce = setTimeout(function () {
      updatePreview();
      renderVirtualFontList();
      refreshSidebarPreviews();
    }, 300);
  });
