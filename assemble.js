#!/usr/bin/env node
/**
 * Assembles the final index.html from modular source files:
 * 1. ui-shell.html  (HTML-only template, no JS)
 * 2. ui-shell.css   (styles, inlined as <style> block)
 * 3. i18n-data.js   (translations, inlined as <script> block)
 * 4. data-fonts.js  (DMC_COLORS)
 * 5. pdf-modules/   (PDF generation, 4 files concatenated)
 * 6. ui-modules/    (UI logic, 12 files concatenated into IIFE)
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const uiShell = fs.readFileSync(path.join(BASE, 'ui-shell.html'), 'utf-8');
const uiCss = fs.readFileSync(path.join(BASE, 'ui-shell.css'), 'utf-8');
const i18nData = fs.readFileSync(path.join(BASE, 'i18n-data.js'), 'utf-8');
const dataFonts = fs.readFileSync(path.join(BASE, 'data-fonts.js'), 'utf-8');

// PDF modules (4 files)
const pdfModules = ['pdf-helpers.js', 'pdf-bitmap.js', 'pdf-renderer.js', 'pdf-modal.js'];
const pdfEngine = pdfModules.map(f => fs.readFileSync(path.join(BASE, 'pdf-modules', f), 'utf-8')).join('\n\n');

// UI modules (12 files, order matters — dependencies flow top to bottom)
const uiModules = [
  'i18n.js', 'state.js', 'bitmap.js', 'renderer.js', 'api.js',
  'preview.js', 'font-manager.js', 'color-manager.js', 'settings.js',
  'pdf-integration.js', 'mobile-ui.js', 'init.js'
];
const uiJs = uiModules.map(f => fs.readFileSync(path.join(BASE, 'ui-modules', f), 'utf-8')).join('\n\n');

// Step 1: Inline the CSS — replace <link> with <style>
let html = uiShell.replace(
  '<link rel="stylesheet" href="ui-shell.css">',
  `<style>\n${uiCss}\n</style>`
);

// Step 2: Insert all scripts before </body>
const scriptsBlock = `
<!-- ═══ jsPDF CDN ═══ -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

<!-- ═══ Embedded Font & Color Data ═══ -->
<script>
${dataFonts}

// Add RGB values to DMC colors (PDF engine needs r,g,b)
DMC_COLORS.forEach(function(c) {
  if (c.hex && !c.r) {
    c.r = parseInt(c.hex.slice(1, 3), 16);
    c.g = parseInt(c.hex.slice(3, 5), 16);
    c.b = parseInt(c.hex.slice(5, 7), 16);
  }
});
</script>

<!-- ═══ PDF Generation Engine ═══ -->
<script>
${pdfEngine}
</script>

<!-- ═══ I18N Translations ═══ -->
<script>
${i18nData}
</script>

<!-- ═══ UI Application Logic ═══ -->
<script>
(function () {
  'use strict';

${uiJs}

})();
</script>
`;

const finalHtml = html.replace('</body>', scriptsBlock + '\n</body>');

// Write output
const outDir = path.join(BASE, 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml, 'utf-8');

const stats = fs.statSync(path.join(outDir, 'index.html'));
console.log(`✅ Assembled: public/index.html (${(stats.size / 1024).toFixed(0)} KB, ${finalHtml.split('\n').length} lines)`);
