// inspector-views.js — UI views: sidebar, overview, detail, export, toast
// Extracted from inspector.html <script> block

import { fonts, appState, escapeHtml, getFilteredFonts } from './inspector-state.js';
import { renderTextToCanvas, renderGlyphToCanvas, getEffectiveBitmap } from './inspector-renderer.js';

// ── Late-binding callbacks for cross-module calls (editor) ──
let editorCallbacks = {};
export function setEditorCallbacks(callbacks) { editorCallbacks = callbacks; }

// ── UI refresh ──

export function refreshUI() {
  const count = fonts.size;
  document.getElementById('sidebarStatus').textContent = count + ' font' + (count !== 1 ? 's' : '') + ' loaded';
  const exportBar = document.getElementById('exportBar');
  exportBar.style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('fontCount').textContent = count + ' fonts';
  document.getElementById('dropZone').style.display = count > 0 ? 'none' : 'block';
  renderSidebar();
  if (appState.currentView === 'overview') renderOverview();
}

export function renderSidebar() {
  const fontListEl = document.getElementById('fontList');
  const filtered = getFilteredFonts();
  fontListEl.innerHTML = '';
  if (!filtered.length && fonts.size > 0) {
    fontListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#b0a090">No matches</div>';
    return;
  }
  for (const { entry } of filtered) {
    const div = document.createElement('div');
    div.className = 'font-item' + (appState.selectedFontId === entry.id ? ' selected' : '');
    div.innerHTML = `<div class="font-item-name">${escapeHtml(entry.name)}</div><div class="font-item-meta">${escapeHtml(String(entry.height))}px &middot; ${escapeHtml(entry.category)} &middot; ${escapeHtml(String(entry.glyphCount))} glyphs</div>`;
    div.addEventListener('click', () => showDetail(entry.id));
    fontListEl.appendChild(div);
  }
}

export function renderOverview() {
  const overviewGrid = document.getElementById('overviewGrid');
  overviewGrid.innerHTML = '';
  const filtered = getFilteredFonts();
  const text = document.getElementById('previewText').value || 'ABCabc 123';
  const scale = parseInt(document.getElementById('scaleSlider').value);
  const color = document.getElementById('colorPicker').value;
  for (const { entry, data } of filtered) {
    const card = document.createElement('div');
    card.className = 'font-card';
    card.innerHTML = `
      <div class="font-card-header"><div class="font-card-title">${escapeHtml(entry.name)}</div><div class="font-card-id">${escapeHtml(entry.id)}</div></div>
      <div class="font-card-stats"><span class="stat-badge blue">${escapeHtml(String(entry.height))}px</span><span class="stat-badge green">${escapeHtml(String(entry.glyphCount))} glyphs</span><span class="stat-badge purple">${escapeHtml(entry.category)}</span></div>
      <div class="font-card-canvas"></div>`;
    card.addEventListener('click', () => showDetail(entry.id));
    overviewGrid.appendChild(card);
    const cc = card.querySelector('.font-card-canvas');
    const cv = renderTextToCanvas(null, text, data, Math.min(scale, 5), color);
    if (cv) { cv.style.maxWidth = '100%'; cv.style.height = 'auto'; cc.appendChild(cv); }
  }
}

export function showDetail(fontId) {
  appState.selectedFontId = fontId;
  appState.currentView = 'detail';
  document.getElementById('overviewView').style.display = 'none';
  document.getElementById('editorView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  const { entry, data } = fonts.get(fontId);
  const G = data.glyphs || {}, keys = Object.keys(G).sort();
  const scale = parseInt(document.getElementById('scaleSlider').value);
  const color = document.getElementById('colorPicker').value;
  const text = document.getElementById('previewText').value || 'ABCabc 123';

  const detailView = document.getElementById('detailView');
  detailView.innerHTML = `
    <button class="detail-back" id="detailBackBtn">&#8592; Back</button>
    <div class="detail-header">
      <h2>${escapeHtml(entry.name)}
        <button class="dl-btn" id="detailDownloadBtn">Download JSON</button>
      </h2>
      <div class="detail-info">
        <span>ID: <strong>${escapeHtml(entry.id)}</strong></span>
        <span>Height: <strong>${escapeHtml(String(entry.height))}px</strong></span>
        <span>Category: <strong>${escapeHtml(entry.category)}</strong></span>
        <span>Glyphs: <strong>${keys.length}</strong></span>
        <span>Spacing: <strong>${escapeHtml(String(entry.letterSpacing))}</strong></span>
        ${entry.source ? `<span>Source: <strong>${escapeHtml(entry.source)}</strong></span>` : ''}
      </div>
    </div>
    <div class="detail-section"><h3>Preview</h3><div class="detail-sample" id="ds"></div></div>
    <div class="detail-section"><h3>Full Alphabet</h3><div class="detail-sample" id="da"></div></div>
    <div class="detail-section"><h3>All Glyphs (${keys.length})</h3><div class="glyph-grid" id="gg"></div></div>`;

  document.getElementById('detailBackBtn').addEventListener('click', () => showOverview());
  document.getElementById('detailDownloadBtn').addEventListener('click', () => downloadJSON(fontId));

  const ds = document.getElementById('ds');
  const c1 = renderTextToCanvas(null, text, data, scale, color);
  if (c1) ds.appendChild(c1);

  const da = document.getElementById('da');
  for (const line of ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 !@#$%&*']) {
    const c = renderTextToCanvas(null, line, data, scale, color);
    if (c) { c.style.marginBottom = '6px'; da.appendChild(c); }
  }

  const gg = document.getElementById('gg');
  const MAX_CELL_PX = 120;
  for (const char of keys) {
    const gl = G[char], bm = getEffectiveBitmap(gl);
    const glyphW = gl.width + 2, glyphH = bm.length + 2;
    const fitScale = Math.max(2, Math.min(scale, Math.floor(MAX_CELL_PX / Math.max(glyphW, glyphH))));

    const cell = document.createElement('div');
    cell.className = 'glyph-cell';
    cell.innerHTML = `<div class="glyph-char">${escapeHtml(char === ' ' ? '\u2423' : char)}</div><div class="glyph-canvas"></div><div class="glyph-meta">${escapeHtml(String(gl.width))}&times;${escapeHtml(String(bm.length))}</div><button class="dl-btn" style="margin-top:4px;font-size:10px;padding:2px 8px">Edit</button>`;
    gg.appendChild(cell);
    const gc = cell.querySelector('.glyph-canvas');
    const cv = renderGlyphToCanvas(null, gl, fitScale, color);
    if (cv) gc.appendChild(cv);
    cell.querySelector('.dl-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editorCallbacks.openEditor?.(fontId, char);
    });
  }
  renderSidebar();
}

export function showOverview() {
  appState.currentView = 'overview';
  appState.selectedFontId = null;
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('editorView').style.display = 'none';
  document.getElementById('overviewView').style.display = 'block';
  renderOverview();
  renderSidebar();
}

// ── Export / download ──

export function downloadJSON(fontId) {
  const { data } = fonts.get(fontId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (data.id || 'font') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Downloaded!');
}

export function exportAllJSON() {
  for (const [id] of fonts) downloadJSON(id);
}

export function copyAllIds() {
  navigator.clipboard.writeText([...fonts.keys()].join(', ')).then(() => showToast('Copied!'));
}

// ── Toast ──

export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1500);
}
