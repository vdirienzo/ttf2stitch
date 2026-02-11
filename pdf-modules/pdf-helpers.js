// ══════════════════════════════════════════════════════════════════
//  Word2Stitch — PDF Helpers
//  Utility functions shared across PDF modules
// ══════════════════════════════════════════════════════════════════

/**
 * Get translated string for PDF. Falls back to English default if t() unavailable.
 */
function pt(key, fallback) {
  if (typeof window.t === 'function') {
    var val = window.t(key);
    if (val && val !== key) return val;
  }
  return fallback;
}

function getLuminance(color) {
  return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if needed.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}
