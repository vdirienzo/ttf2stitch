// ══════════════════════════════════════════════════
//  ttf2stitch Font Inspector — Entry point
//  Wires modules, binds events, bootstraps app
// ══════════════════════════════════════════════════

import { appState, fonts, loadFontData } from './inspector-state.js';
import { processFiles, bindModalEvents, setViewCallbacks as setModalViewCallbacks } from './inspector-modal.js';
import { refreshUI, showOverview, showDetail, showToast, renderOverview, renderSidebar, exportAllJSON, copyAllIds, downloadJSON, setEditorCallbacks } from './inspector-views.js';
import { openEditor, bindEditorEvents, drawEditorGrid, drawEditorPreviews, setViewCallbacks as setEditorViewCallbacks } from './inspector-editor.js';

// ── Wire cross-module callbacks ──
setModalViewCallbacks({ refreshUI, showDetail, showToast });
setEditorCallbacks({ openEditor });
setEditorViewCallbacks({ showDetail, downloadJSON });

// ── DOM refs ──
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewText = document.getElementById('previewText');
const scaleSlider = document.getElementById('scaleSlider');
const scaleLabel = document.getElementById('scaleLabel');
const colorPicker = document.getElementById('colorPicker');

// ── Filter buttons ──
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appState.currentFilter = btn.dataset.filter;
    if (appState.currentView === 'overview') renderOverview();
    renderSidebar();
  });
});

// ── Search ──
document.getElementById('fontSearch').addEventListener('input', e => {
  appState.searchQuery = e.target.value.trim();
  if (appState.currentView === 'overview') renderOverview();
  renderSidebar();
});

// ── Debounced render for toolbar controls ──
let renderTimeout;
function debouncedRender() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    if (appState.currentView === 'overview') renderOverview();
    else if (appState.currentView === 'editor') { drawEditorGrid(); drawEditorPreviews(); }
    else if (appState.selectedFontId) showDetail(appState.selectedFontId);
  }, 200);
}

previewText.addEventListener('input', debouncedRender);
scaleSlider.addEventListener('input', () => { scaleLabel.textContent = scaleSlider.value; debouncedRender(); });
colorPicker.addEventListener('input', debouncedRender);

// ── Sidebar header → back to overview ──
document.getElementById('sidebarHeader').addEventListener('click', showOverview);

// ── Export bar buttons ──
document.getElementById('exportAllBtn').addEventListener('click', exportAllJSON);
document.getElementById('copyIdsBtn').addEventListener('click', copyAllIds);

// ── File input ──
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) processFiles(fileInput.files);
  fileInput.value = '';
});

// ── Drop zone ──
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); processFiles(e.dataTransfer.files); });
dropZone.addEventListener('click', () => fileInput.click());

// ── Body-level drag-and-drop ──
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); processFiles(e.dataTransfer.files); });

// ── Bind modal events ──
bindModalEvents();

// ── Auto-load from server manifest ──
async function tryAutoLoad() {
  try {
    const r = await fetch('/output/_manifest.json');
    if (!r.ok) return;
    const list = await r.json();
    for (const f of list) {
      try { const d = await (await fetch(`/output/${f}`)).json(); loadFontData(d, f); } catch {}
    }
    if (fonts.size > 0) refreshUI();
  } catch {}
}

tryAutoLoad();
