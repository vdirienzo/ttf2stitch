// ══════════════════════════════════════════════════
//  ttf2stitch Font Inspector — State & shared logic
// ══════════════════════════════════════════════════

export const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !\"#%&'()*+,-./:;?";

// ── App-level state (mutable, shared via object reference) ──
export const appState = {
    currentFilter: 'all',
    selectedFontId: null,
    currentView: 'overview',
    searchQuery: '',
    pendingFontFile: null,
};

// ── Editor state (mutable, shared via object reference) ──
export const editorState = {
    fontId: null,
    char: null,
    undoStack: [],
    isDrawing: false,
    lastCell: null,
    drawMode: null,
    saveTimer: null,
    saveStatus: 'idle',
};

export const EDITOR_SCALE = 30;

// ── Font storage ──
export const fonts = new Map();

// ── Utility: HTML escaping ──
export function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// ── Get filtered + sorted fonts based on current app state ──
export function getFilteredFonts() {
    return [...fonts.values()]
        .filter(({ entry }) => {
            if (appState.currentFilter !== 'all' && entry.category !== appState.currentFilter) return false;
            if (appState.searchQuery) {
                const q = appState.searchQuery.toLowerCase();
                return entry.name.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q);
            }
            return true;
        })
        .sort((a, b) => a.entry.height - b.entry.height || a.entry.name.localeCompare(b.entry.name));
}

// ── Load font data into the fonts Map ──
export function loadFontData(data, filename) {
    if (!data || !data.glyphs || !data.version) return;
    const id = data.id || filename.replace(/\.(json|ttf|otf)$/i, '');
    const entry = {
        id,
        name: data.name || id,
        height: data.height || 0,
        category: data.category || 'sans-serif',
        charset: data.charset || 'basic',
        glyphCount: Object.keys(data.glyphs).length,
        source: data.source || '',
        license: data.license || '',
        letterSpacing: data.letterSpacing ?? 1,
        spaceWidth: data.spaceWidth ?? 3,
        tags: data.tags || [],
    };
    fonts.set(id, { entry, data });
}
