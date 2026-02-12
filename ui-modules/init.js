// ui-modules/init.js — Resize handling, init function, window exposures, DOMContentLoaded

  // -- Resize handling --

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updatePreview, 150);
  });

  // -- Initialize --

  function init() {
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
