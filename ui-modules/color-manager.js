// ui-modules/color-manager.js — DMC color swatch rendering and click handlers
// renderColors()

  // -- Color Swatches --

  function renderColors() {
    if (typeof DMC_COLORS === 'undefined' || !DMC_COLORS.length) return;
    colorRow.innerHTML = '';
    var fragment = document.createDocumentFragment();

    DMC_COLORS.forEach(function (color, index) {
      var dot = document.createElement('div');
      dot.className = 'color-dot' + (index === currentColorIndex ? ' selected' : '');
      dot.style.backgroundColor = color.hex;
      dot.dataset.index = index;

      var tip = document.createElement('div');
      tip.className = 'tip';
      tip.textContent = 'DMC ' + color.code + ' \u2014 ' + color.name;
      dot.appendChild(tip);

      dot.addEventListener('click', function () {
        currentColorIndex = index;
        colorRow.querySelectorAll('.color-dot').forEach(function (d) {
          d.classList.toggle('selected', parseInt(d.dataset.index) === index);
        });
        syncMobileColorStrip();
        updatePreview();
      });

      fragment.appendChild(dot);
    });

    colorRow.appendChild(fragment);
  }
