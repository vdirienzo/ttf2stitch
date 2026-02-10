#!/usr/bin/env node
/**
 * Assembles the final index.html from the three agent outputs:
 * 1. data-fonts.js (DMC_COLORS)
 * 2. ui-shell.html (HTML + CSS + UI JS)
 * 3. pdf-engine.js (PDF generation)
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const dataFonts = fs.readFileSync(path.join(BASE, 'data-fonts.js'), 'utf-8');
const uiShell = fs.readFileSync(path.join(BASE, 'ui-shell.html'), 'utf-8');
const pdfEngine = fs.readFileSync(path.join(BASE, 'pdf-engine.js'), 'utf-8');

// Extract parts from ui-shell.html
// The structure is: <!DOCTYPE...><html><head><style>...</style></head><body>...HTML...<script>UI JS</script></body></html>

// Find the <script> tag in ui-shell (the UI logic)
const scriptStartTag = '<script>';
const scriptEndTag = '</script>';
const bodyEnd = '</body>';

// Split at the first <script> tag after the body content
const scriptStart = uiShell.indexOf(scriptStartTag, uiShell.indexOf('<div class="main-layout">'));
const htmlBeforeScript = uiShell.substring(0, scriptStart);
const uiScript = uiShell.substring(scriptStart, uiShell.lastIndexOf(scriptEndTag) + scriptEndTag.length);
const htmlAfterScript = uiShell.substring(uiShell.lastIndexOf(scriptEndTag) + scriptEndTag.length);

// Build the final HTML
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

<!-- ═══ UI Application Logic ═══ -->
${uiScript}

${htmlAfterScript}`;

// Write output
const outDir = path.join(BASE, 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml, 'utf-8');

const stats = fs.statSync(path.join(outDir, 'index.html'));
console.log(`✅ Assembled: public/index.html (${(stats.size / 1024).toFixed(0)} KB, ${finalHtml.split('\n').length} lines)`);
