#!/usr/bin/env node
/**
 * Assembles the final index.html from modular source files:
 * 1. ui-shell.html  (HTML structure + UI JS, references external CSS & I18N)
 * 2. ui-shell.css   (styles, inlined back as <style> block)
 * 3. i18n-data.js   (translations, inlined as <script> block)
 * 4. data-fonts.js  (DMC_COLORS)
 * 5. pdf-engine.js  (PDF generation)
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const uiShell = fs.readFileSync(path.join(BASE, 'ui-shell.html'), 'utf-8');
const uiCss = fs.readFileSync(path.join(BASE, 'ui-shell.css'), 'utf-8');
const i18nData = fs.readFileSync(path.join(BASE, 'i18n-data.js'), 'utf-8');
const dataFonts = fs.readFileSync(path.join(BASE, 'data-fonts.js'), 'utf-8');
const pdfEngine = fs.readFileSync(path.join(BASE, 'pdf-engine.js'), 'utf-8');

// Step 1: Inline the CSS — replace <link rel="stylesheet" href="ui-shell.css"> with <style>
let html = uiShell.replace(
  '<link rel="stylesheet" href="ui-shell.css">',
  `<style>\n${uiCss}\n</style>`
);

// Step 2: Find the UI <script> tag (after the HTML body content)
const scriptStartTag = '<script>';
const scriptEndTag = '</script>';

const scriptStart = html.indexOf(scriptStartTag, html.indexOf('<div class="main-layout">'));
const htmlBeforeScript = html.substring(0, scriptStart);
const uiScript = html.substring(scriptStart, html.lastIndexOf(scriptEndTag) + scriptEndTag.length);
const htmlAfterScript = html.substring(html.lastIndexOf(scriptEndTag) + scriptEndTag.length);

// Step 3: Build the final self-contained HTML
const finalHtml = `${htmlBeforeScript}
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
${uiScript}

${htmlAfterScript}`;

// Write output
const outDir = path.join(BASE, 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml, 'utf-8');

const stats = fs.statSync(path.join(outDir, 'index.html'));
console.log(`✅ Assembled: public/index.html (${(stats.size / 1024).toFixed(0)} KB, ${finalHtml.split('\n').length} lines)`);
