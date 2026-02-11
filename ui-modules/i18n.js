// ui-modules/i18n.js — I18N functions (t, applyLang, setLanguage)

  // I18N data loaded from i18n-data.js

  var currentLang = 'en';

  function t(key) {
    var lang = I18N[currentLang] || I18N.en;
    return lang[key] || I18N.en[key] || key;
  }

  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    document.title = 'Word2Stitch — ' + t('empty_state').split(' ').slice(0, 4).join(' ');
  }

  function setLanguage(lang) {
    if (!I18N[lang]) lang = 'en';
    currentLang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem('w2s_lang', lang); } catch(e) {}
    var sel = document.getElementById('langSelect');
    if (sel) sel.value = lang;
    applyLang();
    if (typeof renderFontListUI === 'function') renderFontListUI();
  }
