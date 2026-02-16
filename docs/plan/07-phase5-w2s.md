# Phase 5 — Word2Stitch React Rewrite

> **Goal**: Rewrite the Word2Stitch frontend in React + TypeScript, keeping the Python rasterization API.

**Depends on**: Phase 4 (Hub deployed, `/text` rewrite configured)
**Unlocks**: Phase 6 (cross-tool features)

---

## 5.1 Why Rewrite?

| Problem | Impact |
|---------|--------|
| Vanilla JS with no types | Bugs reach production (e.g., `onclick` scope bug) |
| IIFE assembly (`assemble.js`) is fragile | 14 JS files concatenated with scope issues |
| Cannot share components | `@stitch/payment`, `@stitch/ui` require React |
| No frontend tests | 159 tests cover Python only, zero UI coverage |
| Custom i18n object | Diverges from StitchX's `i18next` setup |

---

## 5.2 The `@stitch/fonts` Package

Create a shared package for bitmap font types and loading logic, used by both Word2Stitch (text tool) and StitchX (editor).

```
packages/fonts/
├── src/
│   ├── types.ts          # BitmapFont, Glyph, FontMetadata
│   ├── loader.ts         # fetchFont(), cacheFonts(), parseFontJSON()
│   ├── catalog.ts        # Font manifest: names, categories, tags
│   └── index.ts          # Named exports
├── package.json          # "name": "@stitch/fonts"
└── tsconfig.json
```

```typescript
// packages/fonts/src/types.ts
export interface BitmapGlyph {
  bitmap: number[][]
  width: number
}

export interface BitmapFont {
  name: string
  height: number
  letterSpacing: number
  spaceWidth: number
  glyphs: Record<string, BitmapGlyph>
}

export interface FontMetadata {
  file: string
  name: string
  category: 'serif' | 'sans-serif' | 'script' | 'decorative' | 'pixel'
  height: number
  tags: string[]
  preview?: string  // Base64 preview image
}
```

```typescript
// packages/fonts/src/loader.ts
const fontCache = new Map<string, BitmapFont>()

export async function fetchFont(
  baseUrl: string,
  file: string,
  signal?: AbortSignal,
): Promise<BitmapFont> {
  const cached = fontCache.get(file)
  if (cached) return cached

  const response = await fetch(`${baseUrl}/fonts/${file}`, { signal })
  if (!response.ok) throw new Error(`Font load failed: ${file}`)

  const font: BitmapFont = await response.json()
  fontCache.set(file, font)
  return font
}

export function clearFontCache(): void {
  fontCache.clear()
}
```

Both `apps/editor` and `apps/text` depend on `@stitch/fonts` for consistent font handling.

---

## 5.3 Component Architecture

```
apps/text/src/
├── App.tsx                       # Shell: PaymentProvider + i18n + Layout
├── main.tsx                      # Entry: ReactDOM.createRoot
│
├── store/
│   └── usePatternStore.ts        # Zustand: text, font, height, color, aida, align
│
├── components/
│   ├── TextInput/
│   │   ├── TextInput.tsx          # Textarea with character count + debounce
│   │   └── TextInput.test.tsx
│   │
│   ├── FontBrowser/
│   │   ├── FontBrowser.tsx        # Virtual list (react-window) + search + categories
│   │   ├── FontCard.tsx           # Individual font preview card
│   │   ├── FontCard.test.tsx
│   │   └── useFontList.ts         # SWR: fetch /api/fonts, filter, search
│   │
│   ├── Controls/
│   │   ├── HeightSlider.tsx       # Range input: 5-40 stitches
│   │   ├── ColorPicker.tsx        # DMC color grid (449 colors, virtual grid)
│   │   ├── AidaSelector.tsx       # Chip buttons: 11, 14, 16, 18, custom
│   │   └── AlignButtons.tsx       # Left, center, right toggle
│   │
│   ├── Preview/
│   │   ├── PatternCanvas.tsx      # Canvas rendering of bitmap pattern
│   │   ├── StatsBar.tsx           # Size, stitches, crosses, thread length
│   │   └── useRasterize.ts        # Fetch /api/rasterize with abort + cache
│   │
│   ├── Export/
│   │   ├── ExportPanel.tsx        # PDF + JSON + "Open in Editor" buttons
│   │   └── usePDFExport.ts        # jsPDF generation (lazy-loaded)
│   │
│   └── ShareButton/
│       └── ShareButton.tsx        # URL encode + clipboard + toast
│
├── hooks/
│   └── useURLState.ts             # Sync Zustand <-> URL search params
│
└── i18n/
    └── setup.ts                   # i18next config using @stitch/i18n
```

### Component Data Flow

```
                    URL params
                        │
                        v
┌─────────────────────────────────────────────┐
│              usePatternStore (Zustand)       │
│  text | fontFile | height | color | aida    │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
    ┌──────┘    ┌─────┘    ┌────┘
    v           v          v
TextInput  FontBrowser  Controls (Height, Color, Aida, Align)
                               │
                               v
                        useRasterize()
                         /api/rasterize
                               │
                               v
                       PatternCanvas
                               │
                    ┌──────────┼──────────┐
                    v          v          v
              ExportPanel  ShareButton  StatsBar
```

---

## 5.4 Python Rasterization API

Extract from `ttf2stitch/serve.py` into a Vercel Python serverless function. The key improvement is aggressive caching -- font rasterization is deterministic (same input = same output), so cache aggressively at both CDN and browser levels.

```python
# services/rasterize/api/index.py
from http.server import BaseHTTPRequestHandler
import json
import hashlib
from core.rasterizer import rasterize_text

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length))

        font = body['font']
        height = body.get('height', 18)
        text = body.get('text', 'Hello')

        result = rasterize_text(
            font_file=font,
            height=height,
            text=text,
        )

        payload = json.dumps(result).encode()

        # Generate ETag from content hash
        etag = hashlib.md5(payload).hexdigest()

        # Check If-None-Match for 304
        if_none_match = self.headers.get('If-None-Match')
        if if_none_match == etag:
            self.send_response(304)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('ETag', etag)

        # Browser: cache 1 hour, allow stale for 1 week while revalidating
        self.send_header(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        )
        # CDN (Vercel Edge): cache for 7 days
        self.send_header(
            'CDN-Cache-Control',
            'public, max-age=604800'
        )

        self.end_headers()
        self.wfile.write(payload)
```

### Caching Strategy Explained

```
Request flow:

User request  -->  Vercel Edge CDN  -->  Python Function
                        |
                   HIT? serve from CDN cache (0ms cold start)
                        |
                   MISS? invoke function, cache response 7 days
                        |
                   STALE? serve stale, revalidate in background

Cache-Control breakdown:
  s-maxage=86400              CDN considers fresh for 24 hours
  stale-while-revalidate=604800   CDN serves stale up to 7 days while refreshing

CDN-Cache-Control:
  max-age=604800              Vercel Edge caches for 7 full days

Result: After first request, most rasterizations serve from CDN
        with zero Python cold start penalty.
```

### Client-Side Caching Hook

```typescript
// apps/text/src/components/Preview/useRasterize.ts
import useSWR from 'swr'
import { usePatternStore } from '../../store/usePatternStore'

interface RasterResult {
  glyphs: Record<string, { bitmap: number[][]; width: number }>
  height: number
}

async function fetchRasterize(key: string): Promise<RasterResult> {
  const [, font, height, text] = key.split('|')
  const res = await fetch('/api/rasterize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ font, height: Number(height), text }),
  })
  if (!res.ok) throw new Error('Rasterization failed')
  return res.json()
}

export function useRasterize() {
  const { fontFile, height, text } = usePatternStore()

  // SWR deduplicates identical requests and caches results in memory
  const { data, error, isLoading } = useSWR(
    text ? `raster|${fontFile}|${height}|${text}` : null,
    fetchRasterize,
    {
      dedupingInterval: 5000,      // Dedupe identical requests for 5s
      revalidateOnFocus: false,    // Deterministic: no need to revalidate
      keepPreviousData: true,      // Show old pattern while new one loads
    },
  )

  return { pattern: data, error, isLoading }
}
```

---

## 5.5 Zustand Store Design

```typescript
// apps/text/src/store/usePatternStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface PatternState {
  // Data
  text: string
  fontFile: string
  height: number
  colorCode: string     // DMC color code (e.g., '310')
  aida: number          // Aida count (11, 14, 16, 18)
  align: 'left' | 'center' | 'right'

  // Derived (computed on read, not stored)

  // Actions
  setText: (text: string) => void
  setFont: (file: string) => void
  setHeight: (h: number) => void
  setColor: (code: string) => void
  setAida: (count: number) => void
  setAlign: (align: 'left' | 'center' | 'right') => void
  reset: () => void
}

const DEFAULTS = {
  text: 'Hello',
  fontFile: 'GeorgiaPro-Bold.ttf',
  height: 18,
  colorCode: '310',
  aida: 14,
  align: 'center' as const,
}

export const usePatternStore = create<PatternState>()(
  subscribeWithSelector((set) => ({
    ...DEFAULTS,

    setText: (text) => set({ text }),
    setFont: (fontFile) => set({ fontFile }),
    setHeight: (height) => set({ height: Math.max(5, Math.min(40, height)) }),
    setColor: (colorCode) => set({ colorCode }),
    setAida: (aida) => set({ aida }),
    setAlign: (align) => set({ align }),
    reset: () => set(DEFAULTS),
  })),
)
```

### Why `subscribeWithSelector`

Allows components to subscribe to specific slices without re-rendering on unrelated changes:

```typescript
// Only re-renders when fontFile changes, ignores text/height/color changes
const fontFile = usePatternStore((s) => s.fontFile)
```

---

## 5.6 URL State Synchronization

```typescript
// apps/text/src/hooks/useURLState.ts
import { useEffect } from 'react'
import { usePatternStore } from '../store/usePatternStore'

const PARAM_MAP = {
  t: 'text',
  f: 'fontFile',
  h: 'height',
  c: 'colorCode',
  a: 'aida',
  al: 'align',
} as const

export function useURLState() {
  // On mount: load URL params into store
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const store = usePatternStore.getState()

    if (params.has('t')) store.setText(decodeURIComponent(params.get('t')!))
    if (params.has('f')) store.setFont(params.get('f')!)
    if (params.has('h')) store.setHeight(Number(params.get('h')))
    if (params.has('c')) store.setColor(params.get('c')!)
    if (params.has('a')) store.setAida(Number(params.get('a')))
    if (params.has('al')) store.setAlign(params.get('al') as 'left' | 'center' | 'right')
  }, [])

  // Subscribe to store changes -> update URL (debounced)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const unsub = usePatternStore.subscribe((state) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const params = new URLSearchParams()
        if (state.text !== 'Hello') params.set('t', state.text)
        if (state.fontFile !== 'GeorgiaPro-Bold.ttf') params.set('f', state.fontFile)
        if (state.height !== 18) params.set('h', String(state.height))
        if (state.colorCode !== '310') params.set('c', state.colorCode)
        if (state.aida !== 14) params.set('a', String(state.aida))
        if (state.align !== 'center') params.set('al', state.align)

        const url = params.toString()
          ? `${window.location.pathname}?${params}`
          : window.location.pathname
        window.history.replaceState(null, '', url)
      }, 500) // 500ms debounce
    })

    return () => {
      unsub()
      clearTimeout(timeoutId)
    }
  }, [])
}
```

---

## 5.7 Migration Mapping: Vanilla JS to React

| Current Vanilla JS | React Replacement | Notes |
|-------------------|------------------|-------|
| `ui-modules/text-input.js` | `TextInput.tsx` | Controlled component with `usePatternStore` |
| `ui-modules/font-browser.js` | `FontBrowser.tsx` | `react-window` for virtualization (310 fonts) |
| `ui-modules/controls.js` | `Controls/*.tsx` | Split into HeightSlider, ColorPicker, etc. |
| `ui-modules/canvas.js` | `PatternCanvas.tsx` | Same Canvas 2D API, wrapped in `useEffect` |
| `ui-modules/share.js` | `ShareButton.tsx` | Uses `navigator.clipboard` + toast |
| `ui-modules/auth.js` | `@stitch/payment` | Shared package, not local code |
| `ui-modules/pdf-*.js` | `usePDFExport.ts` | Lazy-loaded jsPDF, gated by `@stitch/payment` |
| `ui-modules/i18n.js` | `@stitch/i18n` | i18next replaces custom `I18N` object |
| `ui-modules/theme.js` | `@stitch/theme` | CSS custom properties from shared tokens |
| `data-fonts.js` (inline DMC) | `@stitch/fonts` | Shared package for font types + catalog |
| `shared.js` (globals) | Zustand store | No more global state on `window` |
| `assemble.js` (build) | Vite | Standard bundler, no IIFE concatenation |

---

## 5.8 Migration Checklist

### Core Functionality

- [ ] All 6 state variables mapped to Zustand store
- [ ] Font list fetched via SWR with in-memory caching
- [ ] Rasterization API called with abort controller for cancelled requests
- [ ] Canvas preview renders bitmap pattern identically to current
- [ ] DMC color picker works (449 colors, virtual grid)
- [ ] Height slider (5-40), aida chips (11/14/16/18), align buttons work
- [ ] URL state encoding/decoding matches current format
- [ ] Share button copies URL to clipboard with toast feedback

### Integration

- [ ] `@stitch/payment` integrated (free -> paid -> credits flow)
- [ ] `@stitch/fonts` provides types and loader to FontBrowser
- [ ] `@stitch/i18n` configured with all 17 languages
- [ ] `@stitch/theme` applied (CSS custom properties)
- [ ] PDF export works via lazy-loaded jsPDF

### Quality

- [ ] Vitest unit tests for store, hooks, key components
- [ ] Playwright E2E: type text -> see preview -> download PDF
- [ ] Visual regression tests vs. current Word2Stitch screenshots
- [ ] All 17 languages render correctly
- [ ] Mobile responsive (bottom sheet for font/color/settings)
- [ ] Lighthouse Performance >85 on `/text`
- [ ] Bundle size <150KB gzipped (excluding fonts)

### PWA

- [ ] Service Worker caches static assets
- [ ] Offline mode shows cached pattern (last viewed)
- [ ] Font JSONs cached in Cache Storage for offline use
