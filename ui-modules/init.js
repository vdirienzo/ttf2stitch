// ui-modules/init.js — Resize handling, init function, window exposures, DOMContentLoaded

  // -- Resize handling --

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updatePreview, 150);
  });

  // -- Initialize --

  function loadStateFromURL() {
    var params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;

    var t = params.get('t');
    var f = params.get('f');
    var h = params.get('h');
    var c = params.get('c');
    var a = params.get('a');
    var al = params.get('al');

    if (t) {
      currentText = t;
      if (textInput) textInput.value = t;
      var mobileInput = document.getElementById('mobileTextInput');
      if (mobileInput) mobileInput.value = t;
    }
    if (f) currentFontFile = f;
    if (h) {
      var hNum = parseInt(h, 10);
      if (hNum >= 8 && hNum <= 30) {
        currentHeight = hNum;
        if (heightSlider) heightSlider.value = hNum;
        if (heightValue) heightValue.textContent = hNum;
      }
    }
    if (c) currentColorCode = c;
    if (a) {
      var aNum = parseInt(a, 10);
      if ([11, 14, 16, 18].indexOf(aNum) !== -1) {
        currentAida = aNum;
      }
    }
    if (al && ['left', 'center', 'right'].indexOf(al) !== -1) {
      currentAlign = al;
    }

    // Clean URL
    history.replaceState({}, '', window.location.pathname);
  }

  function init() {
    loadStateFromURL();

    // Detect language
    var savedLang = null;
    try { savedLang = localStorage.getItem('w2s_lang'); } catch(e) {}
    var browserLang = (navigator.language || '').split('-')[0];
    setLanguage(savedLang || (I18N[browserLang] ? browserLang : 'en'));

    // Detect unit preference
    var savedUnit = null;
    try { savedUnit = localStorage.getItem('w2s_unit'); } catch(e) {}
    setDisplayUnit(savedUnit || detectDefaultUnit());

    renderColors();
    initMobileToolbar();
    syncMobileTextInput();
    fetchFontList();
    updatePreview();
  }

  // Expose for pdf-engine
  window.getTextBitmap = getTextBitmap;
  window.getEffectiveBitmap = getEffectiveBitmap;
  window.renderPreview = renderPreview;
  window.getDisplayUnit = function() { return displayUnit; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAuth(init); });
  } else {
    initAuth(init);
  }

  // Wait for DMC_COLORS if loaded late
  var _colorsInterval = setInterval(function () {
    if (typeof DMC_COLORS !== 'undefined') {
      clearInterval(_colorsInterval);
      renderColors();
      populateMobileColorStrip();
    }
  }, 200);
  setTimeout(function () { clearInterval(_colorsInterval); }, 10000);
