// ui-modules/state.js — State variables, DOM refs, and helpers

  // -- State --
  var currentText = 'Hello';
  var currentFontFile = 'GeorgiaPro-Bold.ttf';
  var currentFontName = 'GeorgiaPro-Bold';
  var currentHeight = 18;
  var currentColorCode = '310'; // DMC code (robust with 449 colors)
  var currentAida = 14;
  var currentCategoryFilter = 'all';
  var displayUnit = 'metric'; // 'metric' | 'imperial'
  var currentAlign = 'center'; // 'left' | 'center' | 'right'

  // -- Unit detection & formatting --

  function detectDefaultUnit() {
    var lang = navigator.language || '';
    var parts = lang.split('-');
    var country = (parts[1] || '').toUpperCase();
    // US, Liberia (LR), Myanmar (MM) use imperial
    if (country === 'US' || country === 'LR' || country === 'MM') return 'imperial';
    // Fallback: if just 'en' without country, assume metric (UK, AU, etc.)
    return 'metric';
  }

  function formatSize(wStitches, hStitches, aida) {
    var inW = (wStitches / aida).toFixed(1);
    var inH = (hStitches / aida).toFixed(1);
    var cmW = (wStitches / aida * 2.54).toFixed(1);
    var cmH = (hStitches / aida * 2.54).toFixed(1);
    if (displayUnit === 'imperial') {
      return { value: inW + ' \u00d7 ' + inH, unit: 'in', width: inW + ' in', height: inH + ' in' };
    }
    return { value: cmW + ' \u00d7 ' + cmH, unit: 'cm', width: cmW + ' cm', height: cmH + ' cm' };
  }

  function formatThread(stitches, aida) {
    var metersPerStitch = 0.013 * (14 / aida);
    var totalMeters = stitches * metersPerStitch;
    if (displayUnit === 'imperial') {
      var yards = (totalMeters * 1.09361).toFixed(1);
      return yards + '\u00a0yd';
    }
    return totalMeters.toFixed(1) + '\u00a0m';
  }

  function setDisplayUnit(unit) {
    displayUnit = (unit === 'imperial') ? 'imperial' : 'metric';
    try { localStorage.setItem('w2s_unit', displayUnit); } catch(e) {}
    // Sync toggle buttons
    var toggle = document.getElementById('unitToggle');
    if (toggle) {
      toggle.querySelectorAll('.unit-toggle-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.unit === displayUnit);
      });
    }
    // Refresh custom stitch labels if visible
    if (isCustomAida) {
      updateCustomStitch(currentStitchMm, 'unit');
    }
    updatePreview();
  }

  var categoryLabels = {
    'serif': 'Serif', 'sans-serif': 'Sans', 'script': 'Script',
    'decorative': 'Decorative', 'monospace': 'Mono', 'other': 'Other'
  };

  // Font list from API: [{file, name, size, category}, ...]
  var fontListData = [];

  // Client-side cache: Map<string, fontJSON>
  // Key format: "filename.ttf_height"
  var fontCache = new Map();

  // In-flight request deduplication: Map<cacheKey, Promise>
  var inFlightRequests = new Map();

  // AbortControllers for preview requests: Map<cacheKey, AbortController>
  var previewAbortControllers = new Map();

  // Currently loaded font data (from cache or API)
  var currentFontData = null;

  // -- DOM refs --
  var textInput = document.getElementById('textInput');
  var fontList = document.getElementById('fontList');
  var fontSearch = document.getElementById('fontSearch');
  var heightSlider = document.getElementById('heightSlider');
  var heightValue = document.getElementById('heightValue');
  var colorRow = document.getElementById('colorRow');
  var aidaRow = document.getElementById('aidaRow');
  var btnDownload = document.getElementById('btnDownload');
  var previewEmpty = document.getElementById('previewEmpty');
  var previewWrap = document.getElementById('previewWrap');
  var previewLoading = document.getElementById('previewLoading');
  var mainCanvas = document.getElementById('mainCanvas');
  var previewArea = document.getElementById('previewArea');

  // -- Helpers --

  function getCacheKey(fontFile, height) {
    return fontFile + '_' + height;
  }

  function getCurrentColor() {
    if (typeof DMC_COLORS === 'undefined' || !DMC_COLORS.length) return { hex: '#000000', code: '310', name: 'Black' };
    for (var i = 0; i < DMC_COLORS.length; i++) {
      if (DMC_COLORS[i].code === currentColorCode) return DMC_COLORS[i];
    }
    return DMC_COLORS[0]; // fallback
  }

  function showLoading() {
    previewLoading.classList.remove('hidden');
  }

  function hideLoading() {
    previewLoading.classList.add('hidden');
  }

  function encodeStateToURL() {
    var params = new URLSearchParams();
    if (currentText && currentText !== 'Hello') params.set('t', currentText);
    if (currentFontFile && currentFontFile !== 'GeorgiaPro-Bold.ttf') params.set('f', currentFontFile);
    if (currentHeight && currentHeight !== 18) params.set('h', currentHeight);
    if (currentColorCode && currentColorCode !== '310') params.set('c', currentColorCode);
    if (currentAida && currentAida !== 14) params.set('a', currentAida);
    if (currentAlign && currentAlign !== 'center') params.set('al', currentAlign);
    var qs = params.toString();
    return window.location.origin + window.location.pathname + (qs ? '?' + qs : '');
  }

  function copyPatternLink() {
    var url = encodeStateToURL();
    var msg = (typeof I18N !== 'undefined' && typeof currentLang !== 'undefined' && I18N[currentLang] && I18N[currentLang].share_copied) ? I18N[currentLang].share_copied : 'Link copied!';

    // Try clipboard API, fallback to execCommand
    var done = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        showShareToast(msg);
      }).catch(function() {
        fallbackCopy(url, msg);
      });
      done = true;
    }
    if (!done) fallbackCopy(url, msg);
  }

  function fallbackCopy(text, msg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
    showShareToast(msg);
  }

  function showShareToast(msg) {
    var existing = document.querySelector('.share-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#3d3229;color:#fff;padding:10px 24px;border-radius:8px;font-size:0.85rem;font-family:Anybody,system-ui,sans-serif;z-index:100000;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.style.opacity = '1'; });
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 300);
    }, 2000);
  }
