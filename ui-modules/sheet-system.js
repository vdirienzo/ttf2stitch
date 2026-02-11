// ui-modules/sheet-system.js — Mobile sheet open/close & swipe-to-dismiss

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
