// inspector-editor.js — Pixel editor rendering and dimension manipulation
// Event handling is in inspector-editor-events.js

import { fonts, appState, editorState, EDITOR_SCALE, escapeHtml } from './inspector-state.js';
import { renderTextToCanvas, renderGlyphToCanvas, hexToRgb } from './inspector-renderer.js';
import { bindEditorEvents, scheduleAutoSave } from './inspector-editor-events.js';
export { bindEditorEvents };

// ── Late-binding callbacks for cross-module calls (views) ──
let viewCallbacks = {};
export function setViewCallbacks(callbacks) { viewCallbacks = callbacks; }

// ── Open editor ──

export function openEditor(fontId, char) {
  editorState.fontId = fontId;
  editorState.char = char;
  editorState.drawMode = null;
  editorState.undoStack = [];
  editorState.isDrawing = false;
  editorState.lastCell = null;
  editorState.saveStatus = 'idle';
  editorState.activeTool = 'pencil';

  appState.currentView = 'editor';
  document.getElementById('overviewView').style.display = 'none';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('editorView').style.display = 'block';

  renderEditor();
}

// ── Render editor layout ──

export function renderEditor() {
  const { entry, data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  if (!glyph) return;

  const bm = glyph.bitmap;
  const rows = bm.length;
  const cols = glyph.width;
  const sortedChars = Object.keys(data.glyphs).sort();
  const charIdx = sortedChars.indexOf(editorState.char);
  const hasPrev = charIdx > 0;
  const hasNext = charIdx < sortedChars.length - 1;
  const displayChar = editorState.char === ' ' ? '\u2423' : escapeHtml(editorState.char);

  const editorView = document.getElementById('editorView');
  editorView.innerHTML = `
    <div class="editor-topbar">
      <button class="back-btn" id="editorBack">&#8592; Back</button>
      <div class="editor-char-display">${displayChar}</div>
      <div class="editor-font-info">${escapeHtml(entry.name)} &middot; ${escapeHtml(String(cols))}&times;${escapeHtml(String(rows))}</div>
      <button class="editor-tool-btn ${editorState.activeTool === 'pencil' ? 'active' : ''}" id="editorPencil" title="Pencil (toggle pixels)">&#9998; Pencil</button>
      <button class="editor-tool-btn" id="editorUndo" ${editorState.undoStack.length === 0 ? 'disabled' : ''}>&#8630; Undo</button>
      <button class="editor-tool-btn" id="editorSave">Save</button>
      <button class="editor-tool-btn" id="editorDownload">Download JSON</button>
      <div class="editor-tool-group">
        <button class="editor-nav-btn" id="editorPrev" ${hasPrev ? '' : 'disabled'}>&#8592;</button>
        <button class="editor-nav-btn" id="editorNext" ${hasNext ? '' : 'disabled'}>&#8594;</button>
      </div>
      <div class="editor-save-status ${editorState.saveStatus === 'saved' ? 'saved' : editorState.saveStatus === 'saving' ? 'saving' : ''}" id="editorSaveLabel">
        ${editorState.saveStatus === 'saving' ? 'Saving...' : editorState.saveStatus === 'saved' ? 'Saved' : ''}
      </div>
    </div>
    <div class="editor-body">
      <div class="editor-canvas-wrap">
        <canvas id="editorCanvas" width="${(cols + 2) * EDITOR_SCALE}" height="${(rows + 2) * EDITOR_SCALE}"></canvas>
        <div class="editor-dim-controls">
          <button class="editor-dim-btn" id="addRowTop">+ Row top</button>
          <button class="editor-dim-btn" id="addRowBottom">+ Row bottom</button>
          <button class="editor-dim-btn" id="addColLeft">+ Col left</button>
          <button class="editor-dim-btn" id="addColRight">+ Col right</button>
          <button class="editor-dim-btn" id="rmRowTop" ${rows <= 1 ? 'disabled' : ''}>- Row top</button>
          <button class="editor-dim-btn" id="rmRowBottom" ${rows <= 1 ? 'disabled' : ''}>- Row bottom</button>
          <button class="editor-dim-btn" id="rmColLeft" ${cols <= 1 ? 'disabled' : ''}>- Col left</button>
          <button class="editor-dim-btn" id="rmColRight" ${cols <= 1 ? 'disabled' : ''}>- Col right</button>
        </div>
      </div>
      <div class="editor-side">
        <div class="editor-side-panel">
          <h4>Preview</h4>
          <div class="editor-preview-canvas" id="editorGlyphPreview"></div>
        </div>
        <div class="editor-side-panel">
          <h4>Text Preview</h4>
          <div class="editor-preview-canvas" id="editorTextPreview" style="overflow-x:auto"></div>
        </div>
        <div class="editor-side-panel">
          <h4>Glyph Info</h4>
          <div class="editor-glyph-info">
            <span>Char: <strong>${displayChar}</strong></span>
            <span>Width: <strong>${escapeHtml(String(cols))}</strong></span>
            <span>Height: <strong>${escapeHtml(String(rows))}</strong></span>
            <span>Filled: <strong>${bm.reduce((s, r) => s + [...r].filter(c => c === '1').length, 0)}</strong> px</span>
          </div>
        </div>
      </div>
    </div>`;

  drawEditorGrid();
  drawEditorPreviews();
  bindEditorEvents({
    openEditor,
    drawEditorGrid,
    drawEditorPreviews,
    viewCallbacks,
    bindDimensionControls,
  });
}

// ── Draw editor grid ──

export function drawEditorGrid() {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const bm = glyph.bitmap;
  const rows = bm.length, cols = glyph.width;
  const s = EDITOR_SCALE;
  const pad = 1;

  canvas.width = (cols + pad * 2) * s;
  canvas.height = (rows + pad * 2) * s;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Padding area (light)
  ctx.fillStyle = '#faf6f1';
  ctx.fillRect(0, 0, canvas.width, pad * s);
  ctx.fillRect(0, (rows + pad) * s, canvas.width, pad * s);
  ctx.fillRect(0, 0, pad * s, canvas.height);
  ctx.fillRect((cols + pad) * s, 0, pad * s, canvas.height);

  // Filled cells
  const color = document.getElementById('colorPicker').value;
  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (bm[r] && bm[r][c] === '1') {
        ctx.fillRect((pad + c) * s, (pad + r) * s, s, s);
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = '#f0ebe4';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols + pad * 2; x++) {
    ctx.beginPath();
    ctx.moveTo(x * s + 0.5, 0);
    ctx.lineTo(x * s + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= rows + pad * 2; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * s + 0.5);
    ctx.lineTo(canvas.width, y * s + 0.5);
    ctx.stroke();
  }

  // Heavier border around the editable area
  ctx.strokeStyle = '#e8d5c4';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad * s, pad * s, cols * s, rows * s);
}

// ── Draw editor previews ──

export function drawEditorPreviews() {
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const color = document.getElementById('colorPicker').value;

  // Glyph preview
  const glyphPreview = document.getElementById('editorGlyphPreview');
  if (glyphPreview) {
    glyphPreview.innerHTML = '';
    const cv = renderGlyphToCanvas(null, glyph, 6, color);
    if (cv) glyphPreview.appendChild(cv);
  }

  // Text preview
  const textPreview = document.getElementById('editorTextPreview');
  if (textPreview) {
    textPreview.innerHTML = '';
    const cv = renderTextToCanvas(null, 'ABCabc', data, 4, color);
    if (cv) { cv.style.maxWidth = '100%'; cv.style.height = 'auto'; textPreview.appendChild(cv); }
  }
}

// ── Dimension manipulation ──

function editorAddRow(position) {
  const { entry, data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const emptyRow = '0'.repeat(glyph.width);
  if (position === 'top') {
    glyph.bitmap.unshift(emptyRow);
  } else {
    glyph.bitmap.push(emptyRow);
  }
  editorUpdateDimensions(entry, data);
  editorState.undoStack = [];
  renderEditor();
  scheduleAutoSave();
}

function editorRemoveRow(position) {
  const { entry, data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  if (glyph.bitmap.length <= 1) return;
  if (position === 'top') {
    glyph.bitmap.shift();
  } else {
    glyph.bitmap.pop();
  }
  editorUpdateDimensions(entry, data);
  editorState.undoStack = [];
  renderEditor();
  scheduleAutoSave();
}

function editorAddCol(position) {
  const { entry, data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  if (position === 'left') {
    glyph.bitmap = glyph.bitmap.map(r => '0' + r);
  } else {
    glyph.bitmap = glyph.bitmap.map(r => r + '0');
  }
  glyph.width++;
  editorUpdateDimensions(entry, data);
  editorState.undoStack = [];
  renderEditor();
  scheduleAutoSave();
}

function editorRemoveCol(position) {
  const { entry, data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  if (glyph.width <= 1) return;
  if (position === 'left') {
    glyph.bitmap = glyph.bitmap.map(r => r.slice(1));
  } else {
    glyph.bitmap = glyph.bitmap.map(r => r.slice(0, -1));
  }
  glyph.width--;
  editorUpdateDimensions(entry, data);
  editorState.undoStack = [];
  renderEditor();
  scheduleAutoSave();
}

function editorUpdateDimensions(entry, data) {
  let maxH = 0;
  for (const g of Object.values(data.glyphs)) {
    maxH = Math.max(maxH, g.bitmap ? g.bitmap.length : 0);
  }
  data.height = maxH;
  entry.height = maxH;
  entry.glyphCount = Object.keys(data.glyphs).length;
}

// ── Bind dimension controls (called from events module) ──

function bindDimensionControls() {
  document.getElementById('addRowTop').addEventListener('click', () => editorAddRow('top'));
  document.getElementById('addRowBottom').addEventListener('click', () => editorAddRow('bottom'));
  document.getElementById('addColLeft').addEventListener('click', () => editorAddCol('left'));
  document.getElementById('addColRight').addEventListener('click', () => editorAddCol('right'));
  document.getElementById('rmRowTop').addEventListener('click', () => editorRemoveRow('top'));
  document.getElementById('rmRowBottom').addEventListener('click', () => editorRemoveRow('bottom'));
  document.getElementById('rmColLeft').addEventListener('click', () => editorRemoveCol('left'));
  document.getElementById('rmColRight').addEventListener('click', () => editorRemoveCol('right'));
}
