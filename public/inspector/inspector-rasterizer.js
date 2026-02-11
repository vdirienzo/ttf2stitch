// inspector-rasterizer.js — TTF to bitmap rasterization (browser-side)
// Extracted from inspector.html

import { CHARSET } from './inspector-state.js';

let fontCounter = 0;

/**
 * Morphological dilation: expands filled ('1') pixels by `radius` in all directions.
 */
export function dilateBitmap(bitmap, radius) {
  if (!bitmap.length || radius <= 0) return bitmap;
  const rows = bitmap.length, cols = bitmap[0].length;
  const grid = bitmap.map(r => [...r].map(c => c === '1'));
  const result = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (grid[y][x])
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) result[ny][nx] = true;
          }
  return result.map(r => r.map(c => c ? '1' : '0').join(''));
}

/**
 * Otsu's method: finds the optimal binarization threshold from RGBA image data.
 */
export function otsuThreshold(imageData, w, h) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const gray = Math.round((imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3);
    hist[gray]++;
  }
  const total = w * h;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumBg = 0, wBg = 0, maxVar = 0, best = 128;
  for (let t = 0; t < 256; t++) {
    wBg += hist[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / wBg;
    const meanFg = (sumAll - sumBg) / wFg;
    const variance = wBg * wFg * (meanBg - meanFg) ** 2;
    if (variance > maxVar) { maxVar = variance; best = t; }
  }
  return best;
}

/**
 * Rasterize a TTF/OTF font buffer into bitmap JSON v2 format.
 *
 * @param {ArrayBuffer} arrayBuffer - Font file contents
 * @param {string} filename - Original filename (used for slug/name)
 * @param {object} opts - Rasterization options
 * @param {function} onProgress - Callback for progress messages (replaces direct DOM updates)
 * @returns {object} Font data in JSON v2 format
 */
export async function rasterizeTTF(arrayBuffer, filename, opts, onProgress = () => {}) {
  const { height, threshold, spacing, category, bold = 0, autoThreshold = false, strategy = 'average' } = opts;
  const familyName = `__ttf2stitch_${++fontCounter}__`;

  // Load font into browser
  const face = new FontFace(familyName, arrayBuffer);
  await face.load();
  document.fonts.add(face);

  // Render at large size (height * 20) then scale down for anti-alias quality
  const renderSize = height * 20;
  const glyphs = {};
  let maxH = 0;

  for (let i = 0; i < CHARSET.length; i++) {
    const char = CHARSET[i];
    if (i % 10 === 0) {
      onProgress(`Converting ${i}/${CHARSET.length}...`);
      await new Promise(r => setTimeout(r, 0)); // yield to UI
    }

    if (char === ' ') {
      const sw = Math.max(1, Math.round(height * 0.4));
      glyphs[char] = { width: sw, bitmap: Array(height).fill('0'.repeat(sw)) };
      continue;
    }

    // Render character at large size
    const canvas = document.createElement('canvas');
    canvas.width = renderSize * 3;
    canvas.height = renderSize * 3;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.font = `${renderSize}px "${familyName}"`;
    ctx.fillText(char, renderSize, renderSize);

    // Get text metrics for precise bbox
    const metrics = ctx.measureText(char);
    const left = Math.floor(renderSize + (metrics.actualBoundingBoxLeft ? -metrics.actualBoundingBoxLeft : 0));
    const top2 = Math.floor(renderSize + (metrics.actualBoundingBoxAscent ? -metrics.actualBoundingBoxAscent : 0));
    const right = Math.ceil(renderSize + (metrics.actualBoundingBoxRight || metrics.width || renderSize));
    const bottom = Math.ceil(renderSize + (metrics.actualBoundingBoxDescent || renderSize));

    const cw = right - left;
    const ch = bottom - top2;
    if (cw <= 0 || ch <= 0) continue;

    // Extract content region
    const contentData = ctx.getImageData(left, top2, cw, ch);

    const targetW = Math.max(1, Math.round(cw * height / ch));
    let bitmap = [];

    if (strategy === 'max-ink') {
      // Max-ink: divide high-res into cells, mark '1' if darkest pixel has ink
      const effTh = autoThreshold ? 200 : threshold;
      const cellH = ch / height, cellW = cw / targetW;
      for (let row = 0; row < height; row++) {
        let rowStr = '';
        for (let col = 0; col < targetW; col++) {
          const y1 = Math.floor(row * cellH), y2 = Math.min(Math.floor((row + 1) * cellH), ch);
          const x1 = Math.floor(col * cellW), x2 = Math.min(Math.floor((col + 1) * cellW), cw);
          let minVal = 255;
          for (let py = y1; py < y2 && minVal > 0; py++)
            for (let px = x1; px < x2 && minVal > 0; px++) {
              const idx = (py * cw + px) * 4;
              const gray = (contentData.data[idx] + contentData.data[idx + 1] + contentData.data[idx + 2]) / 3;
              if (gray < minVal) minVal = gray;
            }
          rowStr += minVal < effTh ? '1' : '0';
        }
        bitmap.push(rowStr);
      }
    } else {
      // Average: LANCZOS-style resize then threshold
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = targetW; scaledCanvas.height = height;
      const sctx = scaledCanvas.getContext('2d', { willReadFrequently: true });
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = cw; tmpCanvas.height = ch;
      tmpCanvas.getContext('2d').putImageData(contentData, 0, 0);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(tmpCanvas, 0, 0, targetW, height);
      const scaled = sctx.getImageData(0, 0, targetW, height);
      const effTh = autoThreshold ? otsuThreshold(scaled.data, targetW, height) : threshold;
      for (let y = 0; y < height; y++) {
        let rowStr = '';
        for (let x = 0; x < targetW; x++) {
          const idx = (y * targetW + x) * 4;
          const gray = (scaled.data[idx] + scaled.data[idx + 1] + scaled.data[idx + 2]) / 3;
          rowStr += gray < effTh ? '1' : '0';
        }
        bitmap.push(rowStr);
      }
    }

    // Morphological dilation for bold effect
    if (bold > 0) bitmap = dilateBitmap(bitmap, bold);

    // Trim empty borders
    const trimmed = trimBitmap(bitmap);
    if (trimmed.length === 0 || trimmed[0].length === 0) continue;

    glyphs[char] = { width: trimmed[0].length, bitmap: trimmed };
    maxH = Math.max(maxH, trimmed.length);
  }

  onProgress('');

  // Remove font
  document.fonts.delete(face);

  // Build JSON v2
  const slug = filename.replace(/\.(ttf|otf|woff2?)$/i, '')
    .toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

  return {
    version: 2,
    id: slug,
    name: filename.replace(/\.(ttf|otf|woff2?)$/i, ''),
    height: maxH || height,
    letterSpacing: spacing,
    spaceWidth: Math.max(1, Math.round(height * 0.4)),
    source: '',
    license: '',
    charset: 'basic',
    category: category,
    tags: ['rasterized'],
    glyphs,
  };
}

/**
 * Trim empty rows/columns from a bitmap (array of '01' strings).
 */
export function trimBitmap(bitmap) {
  let bm = [...bitmap];
  // Trim top
  while (bm.length > 0 && !/1/.test(bm[0])) bm.shift();
  // Trim bottom
  while (bm.length > 0 && !/1/.test(bm[bm.length - 1])) bm.pop();
  if (bm.length === 0) return [];
  // Trim left
  const w = bm[0].length;
  let left = 0;
  for (let c = 0; c < w; c++) { if (bm.every(r => r[c] === '0')) left++; else break; }
  let right = 0;
  for (let c = w - 1; c >= left; c--) { if (bm.every(r => r[c] === '0')) right++; else break; }
  if (left > 0 || right > 0) bm = bm.map(r => r.slice(left, w - right));
  return bm;
}
