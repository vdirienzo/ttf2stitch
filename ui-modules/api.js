// ui-modules/api.js — API calls (fetchFontList, rasterizeFont)

  // -- API calls --

  function fetchFontList() {
    return fetch('/api/fonts')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load font list');
        return res.json();
      })
      .then(function (data) {
        fontListData = data;
        renderFontListUI();
        // Auto-rasterize default font on load
        if (currentFontFile && currentText) {
          loadAndRender();
        }
      })
      .catch(function (err) {
        fontList.innerHTML = '';
        var msg = document.createElement('div');
        msg.style.cssText = 'padding:20px;color:var(--text-muted);font-size:12px;text-align:center';
        msg.textContent = t('server_error');
        fontList.appendChild(msg);
        console.error('Font list unavailable');
      });
  }

  function rasterizeFont(fontFile, height) {
    var key = getCacheKey(fontFile, height);

    // L1: Memory cache
    if (fontCache.has(key)) {
      return Promise.resolve(fontCache.get(key));
    }

    // Dedup: return existing in-flight promise
    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }

    showLoading();

    var promise = fetch('/api/rasterize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        font: fontFile,
        height: height,
        bold: 0,
        strategy: 'average'
      })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('Rasterization failed');
      return res.json();
    })
    .then(function (data) {
      fontCache.set(key, data);
      hideLoading();
      return data;
    })
    .catch(function (err) {
      hideLoading();
      console.error('Rasterization failed');
      return null;
    })
    .finally(function () {
      inFlightRequests.delete(key);
    });

    inFlightRequests.set(key, promise);
    return promise;
  }
