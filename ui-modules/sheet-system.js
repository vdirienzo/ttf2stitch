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

  // -- Focus Trap --
  function trapFocus(sheet) {
    var focusable = sheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    sheet._focusTrapHandler = function (e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    sheet.addEventListener('keydown', sheet._focusTrapHandler);
    first.focus();
  }

  function releaseFocus(sheet) {
    if (sheet._focusTrapHandler) {
      sheet.removeEventListener('keydown', sheet._focusTrapHandler);
      delete sheet._focusTrapHandler;
    }
  }

  // -- Sheet Open / Close --
  function openSheet(name) {
    if (!isMobile()) return;
    if (activeSheet === name) {
      closeSheet();
      return;
    }
    // Close any open sheet first (animated via CSS transition)
    if (activeSheet) {
      var prev = sheets[activeSheet];
      prev.classList.remove('open');
      prev.setAttribute('aria-hidden', 'true');
      releaseFocus(prev);
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
    history.pushState({ sheet: name }, '');
    trapFocus(sheet);
  }

  function closeSheet(fromPopstate) {
    if (!activeSheet) return;
    var sheet = sheets[activeSheet];
    if (sheet) {
      releaseFocus(sheet);
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
    }
    sheetBackdrop.classList.remove('visible');
    document.body.classList.remove('sheet-open');
    activeSheet = null;
    if (!fromPopstate) history.back();
  }

  // Backdrop click: forward to toolbar buttons or close sheet
  sheetBackdrop.addEventListener('click', function (e) {
    if (!mobileToolbar) { closeSheet(); return; }
    var toolbarRect = mobileToolbar.getBoundingClientRect();
    if (e.clientY >= toolbarRect.top) {
      var btns = mobileToolbar.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var r = btns[i].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          btns[i].click();
          return;
        }
      }
    }
    closeSheet();
  });

  // Escape key closes sheet
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeSheet) closeSheet();
  });

  // Browser back button closes sheet
  window.addEventListener('popstate', function () {
    if (activeSheet) closeSheet(true);
  });

  // ============================================================
  // == Swipe-to-Dismiss on Sheet Handles                       ==
  // ============================================================

  function initSheetDrag(sheetId) {
    var sheet = document.getElementById(sheetId);
    if (!sheet) return;
    var dragZones = sheet.querySelectorAll('.sheet-handle, .sheet-title');
    if (!dragZones.length) return;

    var startY = 0, currentY = 0, startTime = 0, isDragging = false;

    function onTouchStart(e) {
      if (!sheet.classList.contains('open')) return;
      isDragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      startTime = Date.now();
      sheet.style.transition = 'none';
    }

    function onTouchMove(e) {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      var dy = currentY - startY;
      dy = Math.max(-30, dy);  // Allow small upward pull for rubber-band feedback
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }

    function onTouchEnd() {
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
    }

    for (var i = 0; i < dragZones.length; i++) {
      dragZones[i].addEventListener('touchstart', onTouchStart, { passive: true });
      dragZones[i].addEventListener('touchmove', onTouchMove, { passive: true });
      dragZones[i].addEventListener('touchend', onTouchEnd);
    }
  }

  initSheetDrag('sheetFont');
  initSheetDrag('sheetColor');
  initSheetDrag('sheetSettings');
  initSheetDrag('sheetInfo');
