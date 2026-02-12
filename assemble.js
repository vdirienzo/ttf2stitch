#!/usr/bin/env node
/**
 * Assembles the final index.html from modular source files:
 * 1. ui-shell.html  (HTML-only template, no JS)
 * 2. css/            (9 @layer CSS files, concatenated and inlined as <style> block)
 * 3. i18n-data.js   (translations, inlined as <script> block)
 * 4. data-fonts.js  (DMC_COLORS)
 * 5. shared.js      (bitmap utilities shared by PDF + UI)
 * 6. pdf-modules/   (PDF generation, 5 files concatenated)
 * 7. ui-modules/    (UI logic, 15 files concatenated into IIFE)
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const uiShell = fs.readFileSync(path.join(BASE, 'ui-shell.html'), 'utf-8');
// CSS modules (9 files, cascade layers flow top to bottom)
const cssModules = [
  '00-layers.css', '01-tokens.css', '02-layout.css', '03-sidebar.css',
  '04-controls.css', '05-preview.css', '06-sheets.css', '07-responsive.css',
  '08-auth.css'
];
// nosemgrep: path-join-resolve-traversal — f iterates over hardcoded constant array
const uiCss = cssModules.map(f => fs.readFileSync(path.join(BASE, 'css', f), 'utf-8')).join('\n\n');
const i18nData = fs.readFileSync(path.join(BASE, 'i18n-data.js'), 'utf-8');
const dataFonts = fs.readFileSync(path.join(BASE, 'data-fonts.js'), 'utf-8');
const sharedJs = fs.readFileSync(path.join(BASE, 'shared.js'), 'utf-8');

// PDF modules (5 files)
const pdfModules = ['pdf-helpers.js', 'pdf-bitmap.js', 'pdf-legend.js', 'pdf-renderer.js', 'pdf-modal.js'];
// nosemgrep: path-join-resolve-traversal — f iterates over hardcoded constant array
const pdfEngine = pdfModules.map(f => fs.readFileSync(path.join(BASE, 'pdf-modules', f), 'utf-8')).join('\n\n');

// UI modules (15 files, order matters — dependencies flow top to bottom)
const uiModules = [
  'i18n.js', 'state.js', 'auth.js', 'renderer.js', 'api.js',
  'preview.js', 'font-manager.js', 'color-manager.js', 'settings.js',
  'pdf-integration.js',
  'sheet-system.js', 'virtual-scroll.js', 'sheet-content.js', 'mobile-toolbar.js',
  'bottom-input.js',
  'init.js'
];
// nosemgrep: path-join-resolve-traversal — f iterates over hardcoded constant array
const uiJs = uiModules.map(f => fs.readFileSync(path.join(BASE, 'ui-modules', f), 'utf-8')).join('\n\n');

// Step 1: Inline the CSS — replace <link> with <style>
let html = uiShell.replace(
  '<link rel="stylesheet" href="ui-shell.css">',
  `<style>\n${uiCss}\n</style>`
);

// Step 2: Insert all scripts before </body>
const scriptsBlock = `
<!-- ═══ Lemon Squeezy (checkout overlay) ═══ -->
<script src="https://assets.lemonsqueezy.com/lemon.js" defer><\/script>

<!-- ═══ jsPDF CDN ═══ -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>

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

<!-- ═══ Shared Bitmap Utilities ═══ -->
<script>
${sharedJs}
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

<!-- ═══ Vercel Analytics & Speed Insights ═══ -->
<script defer src="/_vercel/insights/script.js"><\/script>
<script defer src="/_vercel/speed-insights/script.js"><\/script>
`;

const finalHtml = html.replace('</body>', scriptsBlock + '\n</body>');

// Write output
const outDir = path.join(BASE, 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml, 'utf-8');

const stats = fs.statSync(path.join(outDir, 'index.html'));
console.log(`✅ Assembled: public/index.html (${(stats.size / 1024).toFixed(0)} KB, ${finalHtml.split('\n').length} lines)`);
