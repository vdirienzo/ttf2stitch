// inspector-modal.js — Convert modal, presets, file processing
// Extracted from inspector.html

import { fonts, appState, loadFontData } from './inspector-state.js';
import { rasterizeTTF } from './inspector-rasterizer.js';

// Late-binding callbacks for view functions (avoids circular deps)
let viewCallbacks = {};
export function setViewCallbacks(callbacks) { viewCallbacks = callbacks; }

// ── Preset definitions ──
export const PRESETS = {
  elegant: { bold: 1, autoThreshold: true, strategy: 'max-ink', spacing: 0, category: 'script' },
  clean:   { bold: 0, autoThreshold: false, strategy: 'average', spacing: 1, category: 'sans-serif' },
  bold:    { bold: 2, autoThreshold: true, strategy: 'max-ink', spacing: 1, category: 'decorative' },
};

let currentPreset = 'elegant';
let aidaCount = 14;     // stitches per inch
let sizeUnit = 'cm';    // 'cm' or 'in'

// ── File detection ──

export function isFontFile(name) {
  return /\.(ttf|otf|woff2?)$/i.test(name);
}

// ── File processing ──

export function processFiles(files) {
  const fontFiles = [];
  const jsonFiles = [];
  for (const f of files) {
    if (isFontFile(f.name)) fontFiles.push(f);
    else if (f.name.endsWith('.json')) jsonFiles.push(f);
  }

  // Load JSONs directly
  if (jsonFiles.length > 0) {
    Promise.all(jsonFiles.map(f => f.text().then(t => {
      try { loadFontData(JSON.parse(t), f.name); } catch {}
    }))).then(() => {
      if (jsonFiles.length > 0) {
        viewCallbacks.refreshUI?.();
        viewCallbacks.showToast?.(`Loaded ${jsonFiles.length} JSON(s)`);
      }
    });
  }

  // Queue font files for conversion
  if (fontFiles.length === 1) {
    openConvertModal(fontFiles[0]);
  } else if (fontFiles.length > 1) {
    batchConvert(fontFiles);
  }
}

export async function batchConvert(files) {
  const height = 12;
  viewCallbacks.showToast?.(`Converting ${files.length} fonts at ${height}px with auto-threshold + bold...`);
  const progressEl = document.getElementById('modalProgress');
  const onProgress = (msg) => { if (progressEl) progressEl.textContent = msg; };
  for (const file of files) {
    const buf = await file.arrayBuffer();
    try {
      const data = await rasterizeTTF(buf, file.name, {
        height, threshold: 128, spacing: 1, category: 'sans-serif',
        bold: 1, autoThreshold: true, strategy: 'max-ink',
      }, onProgress);
      loadFontData(data, file.name);
    } catch (e) {
      console.warn('Failed to convert', file.name, e);
    }
  }
  viewCallbacks.refreshUI?.();
  viewCallbacks.showToast?.(`Converted ${files.length} font(s)`);
}

// ── Presets ──

export function applyPreset(name) {
  currentPreset = name;
  const p = PRESETS[name];
  document.getElementById('modalBold').value = p.bold;
  document.getElementById('modalAutoThreshold').checked = p.autoThreshold;
  document.getElementById('modalStrategy').value = p.strategy;
  document.getElementById('modalSpacing').value = p.spacing;
  document.getElementById('modalCategory').value = p.category;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const isActive = btn.dataset.preset === name;
    btn.style.borderColor = isActive ? '#e85d75' : '#e8d5c4';
    btn.style.background = isActive ? 'rgba(232,93,117,0.05)' : '#fff';
    btn.classList.toggle('selected', isActive);
  });
}

// ── Fabric (Aida) selection ──

export function selectAida(count) {
  aidaCount = count;
  document.querySelectorAll('.aida-btn').forEach(btn => {
    const isActive = parseInt(btn.dataset.count) === count;
    btn.style.borderColor = isActive ? '#e85d75' : '#e8d5c4';
    btn.style.background = isActive ? 'rgba(232,93,117,0.05)' : '#fff';
    btn.style.color = isActive ? '#e85d75' : '#5a4a3a';
    btn.style.fontWeight = isActive ? '700' : '600';
  });
  recalcStitches();
}

// ── Unit selection (cm / inch) ──

export function selectUnit(unit) {
  sizeUnit = unit;
  const cmBtn = document.getElementById('unitCm');
  const inBtn = document.getElementById('unitIn');
  if (unit === 'cm') {
    cmBtn.style.background = 'linear-gradient(135deg,#e85d75,#d64560)';
    cmBtn.style.color = '#fff';
    inBtn.style.background = '#fff';
    inBtn.style.color = '#5a4a3a';
  } else {
    inBtn.style.background = 'linear-gradient(135deg,#e85d75,#d64560)';
    inBtn.style.color = '#fff';
    cmBtn.style.background = '#fff';
    cmBtn.style.color = '#5a4a3a';
  }
  recalcStitches();
}

// ── Stitch calculation ──

export function recalcStitches() {
  const physicalSize = parseFloat(document.getElementById('modalPhysicalSize').value) || 2;
  // Convert to inches if needed, then multiply by aida count
  const sizeInInches = sizeUnit === 'cm' ? physicalSize / 2.54 : physicalSize;
  const stitches = Math.max(4, Math.round(sizeInInches * aidaCount));

  document.getElementById('modalHeight').value = stitches;
  const resultEl = document.getElementById('stitchResult');
  if (resultEl) resultEl.textContent = stitches;

  // Calculate real physical size (may differ due to rounding)
  const mmPerStitch = 25.4 / aidaCount;
  const realMm = stitches * mmPerStitch;
  const hintEl = document.getElementById('sizeHint');
  if (hintEl) {
    if (sizeUnit === 'cm') {
      hintEl.textContent = `On Aida ${aidaCount}: ${stitches} stitches = ${(realMm / 10).toFixed(1)} cm (each stitch = ${mmPerStitch.toFixed(1)} mm)`;
    } else {
      hintEl.textContent = `On Aida ${aidaCount}: ${stitches} stitches = ${(realMm / 25.4).toFixed(2)}" (each stitch = ${(1 / aidaCount).toFixed(3)}")`;
    }
  }
}

// ── Modal open / close ──

export function openConvertModal(file) {
  appState.pendingFontFile = file;
  document.getElementById('modalTitle').textContent = 'Choose a style';
  document.getElementById('modalSubtitle').textContent = file.name;
  document.getElementById('modalProgress').textContent = '';
  document.getElementById('modalConvertBtn').disabled = false;
  document.getElementById('modalConvertBtn').textContent = 'Convert \u2728';
  // Reset defaults
  aidaCount = 14;
  sizeUnit = 'cm';
  document.getElementById('modalPhysicalSize').value = 2;
  applyPreset('elegant');
  selectAida(14);
  selectUnit('cm');
  recalcStitches();
  document.getElementById('convertModal').classList.add('open');
}

export function closeModal() {
  document.getElementById('convertModal').classList.remove('open');
  appState.pendingFontFile = null;
}

// ── Convert action ──

export async function doConvert() {
  if (!appState.pendingFontFile) return;
  const btn = document.getElementById('modalConvertBtn');
  btn.disabled = true;
  btn.textContent = 'Converting...';

  const file = appState.pendingFontFile;
  const autoTh = document.getElementById('modalAutoThreshold').checked;
  const opts = {
    height: parseInt(document.getElementById('modalHeight').value) || 12,
    threshold: parseInt(document.getElementById('modalThreshold').value) || 128,
    autoThreshold: autoTh,
    bold: parseInt(document.getElementById('modalBold').value) || 0,
    strategy: document.getElementById('modalStrategy').value,
    spacing: parseInt(document.getElementById('modalSpacing').value) || 1,
    category: document.getElementById('modalCategory').value,
  };

  const progressEl = document.getElementById('modalProgress');
  const onProgress = (msg) => { if (progressEl) progressEl.textContent = msg; };

  try {
    const buf = await file.arrayBuffer();
    const data = await rasterizeTTF(buf, file.name, opts, onProgress);
    loadFontData(data, file.name);
    closeModal();
    viewCallbacks.refreshUI?.();
    viewCallbacks.showToast?.(`Converted: ${data.name} (${Object.keys(data.glyphs).length} glyphs)`);
    // Auto-navigate to detail
    viewCallbacks.showDetail?.(data.id);
  } catch (e) {
    if (progressEl) progressEl.textContent = `Error: ${e.message}`;
    console.error(e);
  }

  btn.disabled = false;
  btn.textContent = 'Convert';
}

// ── Bind modal DOM events (call once after DOM ready) ──

export function bindModalEvents() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
  document.querySelectorAll('.aida-btn').forEach(btn => {
    btn.addEventListener('click', () => selectAida(parseInt(btn.dataset.count)));
  });
  document.getElementById('unitCm').addEventListener('click', () => selectUnit('cm'));
  document.getElementById('unitIn').addEventListener('click', () => selectUnit('in'));
  const physInput = document.getElementById('modalPhysicalSize');
  if (physInput) physInput.addEventListener('input', recalcStitches);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalConvertBtn').addEventListener('click', doConvert);
}
