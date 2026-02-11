// ══════════════════════════════════════════════════
//  ttf2stitch Font Inspector — Rendering functions
//  Pure functions: no imports, no side effects
// ══════════════════════════════════════════════════

export function hexToRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

export function getEffectiveBitmap(glyph) {
    if (!glyph.bitmap || !glyph.bitmap.length) return [];
    let last = -1;
    for (let i = 0; i < glyph.bitmap.length; i++) {
        if (/1/.test(glyph.bitmap[i])) last = i;
    }
    return last >= 0 ? glyph.bitmap.slice(0, last + 1) : [];
}

export function renderTextToCanvas(canvas, text, fontData, scale, color) {
    if (!fontData || !fontData.glyphs) return null;
    const G = fontData.glyphs;
    const maxH = Math.max(1, ...Object.values(G).map(g => getEffectiveBitmap(g).length));
    let totalW = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        totalW += ch === ' ' ? (fontData.spaceWidth || 3) : (G[ch] ? G[ch].width : (fontData.spaceWidth || 3));
        if (i < text.length - 1) totalW += (fontData.letterSpacing ?? 1);
    }
    if (totalW <= 0 || maxH <= 0) return null;
    const pw = totalW + 2, ph = maxH + 2, cv = document.createElement('canvas');
    cv.width = pw * scale; cv.height = ph * scale;
    cv.style.width = pw * scale + 'px'; cv.style.height = ph * scale + 'px';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (scale >= 4) {
        ctx.strokeStyle = '#f0ebe4'; ctx.lineWidth = 0.5;
        for (let x = 0; x <= pw; x++) { ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, cv.height); ctx.stroke(); }
        for (let y = 0; y <= ph; y++) { ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(cv.width, y * scale); ctx.stroke(); }
    }
    const rgb = hexToRgb(color);
    ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    const gap = scale >= 4 ? 1 : 0;
    let cx = 1;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || !G[ch]) {
            cx += (ch === ' ' ? (fontData.spaceWidth || 3) : (fontData.spaceWidth || 3));
            if (i < text.length - 1) cx += (fontData.letterSpacing ?? 1);
            continue;
        }
        const gl = G[ch], bm = getEffectiveBitmap(gl), off = maxH - bm.length;
        for (let r = 0; r < bm.length; r++)
            for (let c = 0; c < bm[r].length; c++)
                if (bm[r][c] === '1') ctx.fillRect((cx + c) * scale, (1 + off + r) * scale, scale - gap, scale - gap);
        cx += gl.width;
        if (i < text.length - 1) cx += (fontData.letterSpacing ?? 1);
    }
    return cv;
}

export function renderGlyphToCanvas(canvas, glyph, scale, color) {
    const bm = getEffectiveBitmap(glyph);
    if (!bm.length) return null;
    const w = glyph.width + 2, h = bm.length + 2, cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (scale >= 4) {
        ctx.strokeStyle = '#f0ebe4'; ctx.lineWidth = 0.5;
        for (let x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, cv.height); ctx.stroke(); }
        for (let y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(cv.width, y * scale); ctx.stroke(); }
    }
    const rgb = hexToRgb(color);
    ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    const gap = scale >= 4 ? 1 : 0;
    for (let r = 0; r < bm.length; r++)
        for (let c = 0; c < bm[r].length; c++)
            if (bm[r][c] === '1') ctx.fillRect((1 + c) * scale, (1 + r) * scale, scale - gap, scale - gap);
    return cv;
}
