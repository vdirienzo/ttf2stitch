// inspector-editor-events.js — Editor event handlers and pixel operations
// Extracted from inspector-editor.js to separate concerns

import { fonts, editorState, EDITOR_SCALE } from './inspector-state.js';
// NO imports from inspector-editor.js — avoids circular dependency.
// Functions that live in inspector-editor.js are received via the callbacks parameter.

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

function editorUndo(callbacks) {
  if (editorState.undoStack.length === 0) return;
  const { row, col, oldValue } = editorState.undoStack.pop();
  const { data } = fonts.get(editorState.fontId);
  const glyph = data.glyphs[editorState.char];
  const oldRow = glyph.bitmap[row];
  glyph.bitmap[row] = oldRow.substring(0, col) + oldValue + oldRow.substring(col + 1);
  callbacks.drawEditorGrid();
  callbacks.drawEditorPreviews();
  scheduleAutoSave();
  const btn = document.getElementById('editorUndo');
  if (btn) btn.disabled = editorState.undoStack.length === 0;
}

// ── Auto-save ──

export function scheduleAutoSave() {
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

function editorHighlightCell(drawEditorGrid, row, col) {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;
  drawEditorGrid();
  const ctx = canvas.getContext('2d');
  const s = EDITOR_SCALE;
  ctx.fillStyle = 'rgba(232, 93, 117, 0.15)';
  ctx.fillRect((1 + col) * s, (1 + row) * s, s, s);
}

// ── Bind editor events ──
// Accepts a callbacks object to avoid circular imports:
//   { openEditor, drawEditorGrid, drawEditorPreviews, viewCallbacks }

export function bindEditorEvents(callbacks) {
  const { openEditor, drawEditorGrid, drawEditorPreviews, viewCallbacks } = callbacks;
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
      editorHighlightCell(drawEditorGrid, cell.row, cell.col);
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

  document.getElementById('editorUndo').addEventListener('click', () => editorUndo(callbacks));

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
  callbacks.bindDimensionControls();
}
