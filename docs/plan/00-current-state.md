# 00 — Current State

> Inventory of every production asset before the monorepo migration.
> Date: 2026-02-16 | Source: STITCHINGBUNDLE.md Section 2

---

## StitchX (Pattern Editor)

| Aspect | Details |
|--------|---------|
| **URL** | https://stitchx.vercel.app |
| **Repo** | `/home/user/projects/stitchx` |
| **Stack** | React **19.2** + TypeScript **5.9** + Vite **7.2** + Zustand **5** |
| **State** | Zustand (7 slices) + Zundo (undo/redo, 50 levels) |
| **Styling** | Inline styles (React CSSProperties) — no Tailwind in production |
| **i18n** | i18next **25.8** + react-i18next (17 languages, lazy-loaded) |
| **PDF** | jsPDF **4.0** — multi-page: color grid, symbol grid, legend, bookmarks |
| **Canvas** | Hybrid model: DrawingSource (sparse) <-> Pattern (dense), synced atomically |
| **PWA** | Service Worker with auto-versioned cache |
| **Tests** | ~2200 tests (Vitest + Testing Library + Playwright) |
| **CI** | GitHub Actions (lint + typecheck + test) |
| **Deploy** | Vercel (auto-deploy `main` only) |
| **Monetization** | **None** |
| **Branch** | `redesign/canvas-first` (V2 UI in progress) |

### Feature Inventory

19 drawing tools, image import (K-means++), OXS import/export, 70 bitmap fonts, 500+ DMC colors, PDF export, backstitch, french knots, beads, ornaments.

---

## Word2Stitch (Text to Pattern)

| Aspect | Details |
|--------|---------|
| **URL** | https://word2stitch.vercel.app |
| **Repo** | `/home/user/projects/word2stitch/ttf2stitch` |
| **Stack** | Python CLI (fontTools + PIL) + vanilla JS web app |
| **Backend** | Python HTTP server (`serve.py`) with `/api/rasterize` endpoint |
| **Frontend** | Single `index.html` assembled from `ui-modules/` (14 JS files in IIFE) |
| **Assembly** | `assemble.js` (Node): `ui-shell.html` + `ui-shell.css` + `i18n-data.js` + `data-fonts.js` + `shared.js` + `pdf-modules/` (5 files) + `ui-modules/` (14 files) -> `public/index.html` (~195KB) |
| **Styling** | CSS files (8 layers via `@layer`) |
| **i18n** | Custom `I18N` object (17 languages, inline) |
| **PDF** | jsPDF (loaded via CDN, `pdf-modules/` — 5 files) |
| **Tests** | 159 tests (pytest) — backend only, zero frontend tests |
| **Deploy** | Vercel (static frontend, Python API needs separate hosting) |
| **Monetization** | **Lemon Squeezy** — $1.99 single, $9.99/10-pack, $24.99/yr |

### Feature Inventory

Text input, 310 fonts, height/color/aida controls, URL share, preview canvas, PDF export with multiple page layouts.

---

## Shared Assets

| Asset | StitchX | Word2Stitch | Notes |
|-------|---------|-------------|-------|
| **Bitmap font JSON v2** | Consumer (`src/lib/text/bitmapRenderer.ts`) | Producer (ttf2stitch CLI generates them) | StitchX depends on W2S for font data |
| **DMC colors** | 500+ colors (`public/dmc-colors.json`) | 449 colors (inline `data-fonts.js`) | Superset in StitchX; should unify |
| **i18n languages** | 17 (en, es, fr, de, it, pt, nl, ja, ko, zh, ru, pl, sv, da, fi, uk, hu) | Same 17 | Different i18n systems (i18next vs custom) |
| **Design language** | Warm earth tones (`#3d3229`, `#b83a2a`, `#faf8f5`) | Same palette | Already visually consistent |
| **jsPDF** | v4.0 (bundled) | CDN-loaded | Both produce multi-page PDF patterns |

---

## Version Pinboard

Exact versions currently in production, for dependency alignment during monorepo setup:

| Package | StitchX | Word2Stitch | Monorepo Target |
|---------|---------|-------------|-----------------|
| React | **19.2** | N/A (vanilla JS) | 19.2 |
| TypeScript | **5.9** | N/A | 5.9 |
| Vite | **7.2** | N/A | 7.2 |
| Zustand | **5** | N/A | 5 |
| jsPDF | **4.0** | 4.0 (CDN) | 4.0 |
| i18next | **25.8** | N/A (custom) | 25.8 |
| Python | N/A | 3.12+ | 3.12+ |
| fontTools | N/A | latest | latest |
| Pillow | N/A | latest | latest |
| Pydantic | N/A | v2 | v2 |

---

## Key Gaps (Pre-Migration)

| Gap | Impact | Addressed In |
|-----|--------|-------------|
| StitchX has **zero monetization** | No revenue from most complex tool | Phase 3 |
| Word2Stitch frontend has **zero tests** | Regressions go undetected | Phase 5 (React rewrite) |
| Word2Stitch uses **vanilla JS + IIFE assembly** | Cannot share React components | Phase 5 |
| DMC color sets differ (500 vs 449) | Inconsistent color matching | Phase 6 (shared package) |
| i18n systems differ (i18next vs custom) | Duplicate translation effort | Phase 5 (unify on i18next) |
| No shared domain | Separate localStorage, no cross-tool credits | Phase 4 |
