// pdf-modules/pdf-bitmap.js — Thin wrapper over shared getTextBitmap()

function getTextBitmapForPDF(text, fontData) {
  return getTextBitmap(text, fontData, { align: 'top' }).bitmap;
}
