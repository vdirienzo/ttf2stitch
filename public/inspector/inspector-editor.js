// inspector-editor.js — Pixel editor for individual glyphs
// Extracted from inspector.html <script> block

import { fonts, appState, editorState, EDITOR_SCALE, escapeHtml } from './inspector-state.js';
import { renderTextToCanvas, renderGlyphToCanvas, getEffectiveBitmap, hexToRgb } from './inspector-renderer.js';

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
  bindEditorEvents();
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

// ── Cell detection from mouse position ──

function editorCellFromMouse(e) {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const col = Math.floor(x / EDITOR_SCALE) - 1;
  const row = Math.floor(y / EDITOR_SCALE) - 1;
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  if (row < 0 || row >= glyph.bitmap.length || col < 0 || col >= glyph.width) return null;
  return { row, col };
}

// ── Pixel toggle ──

function editorTogglePixel(row, col) {
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const oldValue = glyph.bitmap[row][col];
  const newValue = editorState.drawMode;
  if (oldValue === newValue) return false;

  editorState.undoStack.push({ row, col, oldValue });

  const oldRow = glyph.bitmap[row];
  glyph.bitmap[row] = oldRow.substring(0, col) + newValue + oldRow.substring(col + 1);

  return true;
}

// ── Undo ──

function editorUndo() {
  if (editorState.undoStack.length === 0) return;
  const { row, col, oldValue } = editorState.undoStack.pop();
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const oldRow = glyph.bitmap[row];
  glyph.bitmap[row] = oldRow.substring(0, col) + oldValue + oldRow.substring(col + 1);
  drawEditorGrid();
  drawEditorPreviews();
  scheduleAutoSave();
  const btn = document.getElementById('editorUndo');
  if (btn) btn.disabled = editorState.undoStack.length === 0;
}

// ── Auto-save ──

function scheduleAutoSave() {
  clearTimeout(editorState.saveTimer);
  editorState.saveTimer = setTimeout(() => autoSaveEditor(), 1000);
}

async function autoSaveEditor() {
  if (!editorState.fontId) return;
  const { data } = fonts.get(editorState.fontId);
  const label = document.getElementById('editorSaveLabel');
  editorState.saveStatus = 'saving';
  if (label) { label.textContent = 'Saving...'; label.className = 'editor-save-status saving'; }

  try {
    const resp = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (resp.ok) {
      editorState.saveStatus = 'saved';
      if (label) { label.textContent = 'Saved'; label.className = 'editor-save-status saved'; }
    }
  } catch {
    editorState.saveStatus = 'idle';
    if (label) { label.textContent = ''; label.className = 'editor-save-status'; }
  }
}

// ── Highlight cell on hover ──

function editorHighlightCell(row, col) {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;
  drawEditorGrid();
  const ctx = canvas.getContext('2d');
  const s = EDITOR_SCALE;
  ctx.fillStyle = 'rgba(232, 93, 117, 0.15)';
  ctx.fillRect((1 + col) * s, (1 + row) * s, s, s);
}

// ── Bind editor events ──

export function bindEditorEvents() {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;

  // Mouse drawing
  canvas.addEventListener('mousedown', (e) => {
    if (editorState.activeTool !== 'pencil') return;
    const cell = editorCellFromMouse(e);
    if (!cell) return;
    const { data } = fonts.get(editorState.fontId);
    const currentValue = data.glyphs[editorState.char].bitmap[cell.row][cell.col];
    editorState.drawMode = currentValue === '1' ? '0' : '1';
    editorState.isDrawing = true;
    editorState.lastCell = `${cell.row},${cell.col}`;
    if (editorTogglePixel(cell.row, cell.col)) {
      drawEditorGrid();
      drawEditorPreviews();
      scheduleAutoSave();
      const btn = document.getElementById('editorUndo');
      if (btn) btn.disabled = false;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const cell = editorCellFromMouse(e);
    if (!cell) return;
    const cellKey = `${cell.row},${cell.col}`;
    if (editorState.isDrawing && editorState.activeTool === 'pencil') {
      if (cellKey !== editorState.lastCell) {
        editorState.lastCell = cellKey;
        if (editorTogglePixel(cell.row, cell.col)) {
          drawEditorGrid();
          drawEditorPreviews();
          scheduleAutoSave();
          const btn = document.getElementById('editorUndo');
          if (btn) btn.disabled = false;
        }
      }
    } else if (!editorState.isDrawing) {
      editorHighlightCell(cell.row, cell.col);
    }
  });

  canvas.addEventListener('mouseup', () => { editorState.isDrawing = false; editorState.lastCell = null; });
  canvas.addEventListener('mouseleave', () => {
    editorState.isDrawing = false;
    editorState.lastCell = null;
    drawEditorGrid();
  });

  // Toolbar buttons
  document.getElementById('editorBack').addEventListener('click', () => {
    viewCallbacks.showDetail?.(editorState.fontId);
  });

  document.getElementById('editorPencil').addEventListener('click', () => {
    const isActive = editorState.activeTool === 'pencil';
    editorState.activeTool = isActive ? null : 'pencil';
    document.getElementById('editorPencil').classList.toggle('active', !isActive);
    canvas.classList.toggle('no-tool', isActive);
  });

  document.getElementById('editorUndo').addEventListener('click', () => editorUndo());

  document.getElementById('editorSave').addEventListener('click', () => {
    clearTimeout(editorState.saveTimer);
    autoSaveEditor();
  });

  document.getElementById('editorDownload').addEventListener('click', () => {
    viewCallbacks.downloadJSON?.(editorState.fontId);
  });

  // Navigation
  const { data } = fonts.get(editorState.fontId);
  const sortedChars = Object.keys(data.glyphs).sort();
  const charIdx = sortedChars.indexOf(editorState.char);

  document.getElementById('editorPrev').addEventListener('click', () => {
    if (charIdx > 0) openEditor(editorState.fontId, sortedChars[charIdx - 1]);
  });

  document.getElementById('editorNext').addEventListener('click', () => {
    if (charIdx < sortedChars.length - 1) openEditor(editorState.fontId, sortedChars[charIdx + 1]);
  });

  // Dimension controls
  document.getElementById('addRowTop').addEventListener('click', () => editorAddRow('top'));
  document.getElementById('addRowBottom').addEventListener('click', () => editorAddRow('bottom'));
  document.getElementById('addColLeft').addEventListener('click', () => editorAddCol('left'));
  document.getElementById('addColRight').addEventListener('click', () => editorAddCol('right'));
  document.getElementById('rmRowTop').addEventListener('click', () => editorRemoveRow('top'));
  document.getElementById('rmRowBottom').addEventListener('click', () => editorRemoveRow('bottom'));
  document.getElementById('rmColLeft').addEventListener('click', () => editorRemoveCol('left'));
  document.getElementById('rmColRight').addEventListener('click', () => editorRemoveCol('right'));
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
