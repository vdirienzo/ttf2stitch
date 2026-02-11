# REFACTORING.md — Frontend Modularization Plan

> Generated 2025-02-11 | Status: In Progress
> Baseline: `code-quality.md` rules (500L hard limit, 200-400L ideal, functions <50L, params <4)

## Current State After 4 Rounds of Refactoring

### Backend Python: CLEAN
All files under 400L. FontConversionOptions, server_utils, CLI split done. 150 tests passing.

### Frontend: 3 Files Pending

| File | Lines | Target | Status |
|------|------:|-------:|--------|
| `ui-shell.html` | 1,924 | ~400 | Phase 1 done (CSS + I18N extracted) |
| `inspector.html` | 1,580 | ~187 | Modules created, needs HTML rewrite |
| `pdf-engine.js` | 801 | ~160 max | Not started |

---

## Phase 1: Inspector HTML Rewrite (READY TO EXECUTE)

### What exists
7 ES module files already created in `public/inspector/`:
```
public/inspector/
  inspector.css              (357L) — all styles + extracted inline
  inspector-state.js         (72L)  — fonts Map, appState, editorState, escapeHtml, loadFontData
  inspector-renderer.js      (85L)  — hexToRgb, getEffectiveBitmap, renderTextToCanvas, renderGlyphToCanvas
  inspector-rasterizer.js    (218L) — dilateBitmap, otsuThreshold, rasterizeTTF, trimBitmap
  inspector-modal.js         (237L) — PRESETS, processFiles, batchConvert, openConvertModal, doConvert
  inspector-views.js         (168L) — refreshUI, renderSidebar, renderOverview, showDetail, showToast
  inspector-editor.js        (443L) — openEditor, renderEditor, drawEditorGrid, bindEditorEvents
  inspector-main.js          (96L)  — entry point, DOM refs, events, init
```

### What needs to happen
1. Rewrite `public/inspector.html` as slim HTML template (~187L):
   - Replace `<style>...</style>` with `<link rel="stylesheet" href="inspector/inspector.css">`
   - Remove entire `<script>` section (~1,113L of JS)
   - Add `<script type="module" src="inspector/inspector-main.js"></script>`
   - Remove inline `style="..."` from modal elements (now CSS classes in inspector.css)
   - Remove inline `onclick` handlers (now addEventListener in modules)
2. Test in browser: load JSON, drop TTF, convert, overview, detail, editor, save

### Cross-module dependency pattern
```
                  inspector-state.js
                  /       |        \
                 /        |         \
    inspector-renderer.js |   inspector-rasterizer.js
           \          \   |   /
            \          \  |  /
         inspector-views.js  inspector-modal.js
              \          /
               \        /
          inspector-editor.js
                  |
          inspector-main.js (entry point)
```

Circular deps (views <-> editor) resolved via late-binding callbacks:
- `views.setEditorCallbacks({ openEditor })`
- `editor.setViewCallbacks({ showDetail, downloadJSON })`
- `modal.setViewCallbacks({ refreshUI, showDetail, showToast })`

### Risk: LOW
- Modules tested via `node --check`
- ES modules are deferred by default
- serve.py serves static files with zero changes needed

---

## Phase 2: ui-shell.html JS Modularization

### Architecture decision: CONCATENATION (not ES modules)
`public/index.html` must remain a single self-contained file (runs without server).
Use `assemble.js` to concatenate JS files inside a single IIFE.

### Current state
```
ui-shell.html  (1,924L) = HTML template (397L) + JS IIFE (~1,527L)
ui-shell.css   (1,480L) — already extracted
i18n-data.js   (1,179L) — already extracted
```

### Proposed JS module split (12 files, load order matters)

| # | File | Functions | Est. Lines | Dependencies |
|---|------|-----------|-----------|--------------|
| 1 | `i18n.js` | `t()`, `applyLang()`, `setLanguage()` | ~29 | i18n-data (global I18N) |
| 2 | `state.js` | 14 state vars, detectDefaultUnit, formatSize, formatThread, setDisplayUnit, getCacheKey, getCurrentColor, showLoading, hideLoading | ~106 | DMC_COLORS (global) |
| 3 | `bitmap.js` | `getEffectiveBitmap()`, `getTextBitmap()` | ~57 | none (pure) |
| 4 | `renderer.js` | `renderPreview()` | ~77 | bitmap |
| 5 | `api.js` | `fetchFontList()`, `rasterizeFont()` | ~57 | state |
| 6 | `preview.js` | `updatePreview()`, `loadAndRender()` | ~83 | state, renderer, api |
| 7 | `font-manager.js` | `renderFontListUI()`, search, category tabs | ~125 | state, i18n |
| 8 | `color-manager.js` | `renderColors()`, click handlers | ~32 | state |
| 9 | `settings.js` | stitchMmToAida, formatStitchDisplay, updateCustomStitch, aida/height/stitch/unit handlers | ~103 | state |
| 10 | `pdf-integration.js` | Download button handler | ~23 | state, i18n |
| 11 | `mobile-ui.js` | Sheets, virtual scroll, toolbar, sync | ~722 | state, renderer, api, i18n |
| 12 | `init.js` | `init()`, window exposures, DOMContentLoaded, resize | ~41 | everything |

### Build: assemble.js changes
```javascript
// Read individual JS modules and concatenate inside IIFE
const jsModules = [
  'i18n.js', 'state.js', 'bitmap.js', 'renderer.js', 'api.js',
  'preview.js', 'font-manager.js', 'color-manager.js', 'settings.js',
  'pdf-integration.js', 'mobile-ui.js', 'init.js'
];
const jsContent = jsModules.map(f => fs.readFileSync(path.join(BASE, 'ui-modules', f), 'utf-8')).join('\n\n');
// Wrap in IIFE: (function() { 'use strict'; ... })();
```

### Risk: MEDIUM
- All modules share IIFE closure scope (no import/export needed)
- `mobile-ui.js` at 722L is over limit — split further if needed (see Phase 4)
- Cross-cutting calls (`updatePreview`, `loadAndRender`, `syncMobile*`) need careful ordering
- Must test both dev (ui-shell.html with `<link>` and external scripts) AND built (index.html single file)

### Phase 2a: Quick modules (pure/core)
Extract: `i18n.js`, `state.js`, `bitmap.js`, `renderer.js`, `api.js`
These have minimal cross-dependencies and are safest to extract first.

### Phase 2b: UI modules
Extract: `preview.js`, `font-manager.js`, `color-manager.js`, `settings.js`, `pdf-integration.js`
These depend on state/renderer/api but are relatively independent of each other.

### Phase 2c: Mobile + Init
Extract: `mobile-ui.js`, `init.js`
Mobile is the largest and most interconnected — extract last.

---

## Phase 3: pdf-engine.js Split

### Proposed split (4 files)

| File | Functions | Lines | Deps |
|------|-----------|------:|------|
| `pdf-helpers.js` | `pt()`, `getLuminance()`, `truncate()` | ~15 | window.t (i18n) |
| `pdf-bitmap.js` | `getTextBitmapForPDF()` | ~72 | none (pure) |
| `pdf-renderer.js` | `calculatePDFLayout`, `drawGridPage`, `drawLegend`, `drawBrandedHeader`, `drawBrandedFooter`, `buildPDF` | ~450 | helpers, bitmap, jsPDF |
| `pdf-modal.js` | `_createPrintModal()`, `generatePDF()` | ~161 | renderer (buildPDF) |

### Build integration
`assemble.js` already injects pdf-engine.js as a `<script>` block.
Extend to concatenate the 4 pdf files into one block.

### Additional improvements
- `drawLegend` (185L, 12 params) — extract `drawThreadTable`, `drawPatternInfo`, `drawSizeBoxes`
- `drawGridPage` (133L, 10 params) — use options object instead of 10 positional params
- Unify `getTextBitmapForPDF` with `getTextBitmap` from ui-shell using `{align: 'top'|'bottom'}` option

### Risk: LOW
- pdf-engine functions have clear boundaries
- No shared mutable state
- All functions are called via explicit function calls (no event wiring)

---

## Phase 4 (Optional): Split mobile-ui.js

If `mobile-ui.js` exceeds 500L after Phase 2:

| File | Functions | Est. Lines |
|------|-----------|-----------|
| `sheet-system.js` | `openSheet()`, `closeSheet()`, `initSheetDrag()`, backdrop, escape | ~111 |
| `virtual-scroll.js` | `getFilteredFonts()`, `populateFontSheet()`, `renderVirtualFontList()`, font preview queue | ~265 |
| `sheet-content.js` | `populateColorSheet()`, `syncSettingsSheet()`, `syncInfoSheet()` | ~211 |
| `mobile-toolbar.js` | sync helpers, slider, button handlers, `initMobileToolbar()` | ~135 |

---

## Phase 5 (Optional): Shared utilities

### Code duplicated between apps

| Function | ui-shell | inspector | pdf-engine |
|----------|:--------:|:---------:|:----------:|
| `getEffectiveBitmap()` | L3212 | inspector-renderer.js | — |
| `getTextBitmap()` | L3223 | — | L30 (ForPDF) |
| `escapeHtml()` | — | inspector-state.js | — |

### Proposal: `shared.js`
- Unified `getEffectiveBitmap()` (reconcile null-safety + iteration direction)
- Unified `getTextBitmap()` with `{align: 'top'|'bottom', format: 'boolean'|'object'}` options
- `assemble.js` inlines it before both pdf-engine and UI script
- inspector imports via `<script src="../shared.js">` before modules

---

## Dead CSS to Clean

### ui-shell.css (~40L dead)
| Class | Cause |
|-------|-------|
| `.custom-unit-toggle` | Planned feature, not wired |
| `.custom-unit-btn` | Same |
| `.custom-count-label` | Same |
| `.ruler-height-wrap/label/val` | Replaced by vertical ruler |

### inspector.css (~1L dead)
| Class | Cause |
|-------|-------|
| `.stat-badge.orange` | Color variant never applied |

---

## Untracked Files to Decide

| File | Lines | Decision needed |
|------|------:|----------------|
| `fontconverter.sh` | ? | Commit or delete? |
| `public/header-options.html` | 713 | Design mockup — commit, move to /docs, or delete? |
| `tests/test_pdf_engine.js` | 609 | JS tests — integrate with test suite or delete? |

---

## Execution Priority

| Priority | Action | Impact | Effort |
|:--------:|--------|:------:|:------:|
| 1 | Rewrite inspector.html as slim template | -1,393L | Low |
| 2 | Phase 2a: Extract core JS modules from ui-shell | -300L from ui-shell | Medium |
| 3 | Phase 2b-c: Extract UI + mobile modules | -1,200L from ui-shell | Medium-High |
| 4 | Phase 3: Split pdf-engine.js | -801L (4 files) | Low |
| 5 | Phase 4: Split mobile-ui.js | Conditional | Low |
| 6 | Phase 5: Shared utilities | DRY improvement | Medium |
| 7 | Dead CSS cleanup | ~41L removed | Trivial |
| 8 | Decide untracked files | Repo hygiene | Trivial |
