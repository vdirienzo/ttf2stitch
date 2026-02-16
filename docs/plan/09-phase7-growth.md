# Phase 7 — Ecosystem Growth

> **Goal**: Expand the platform with new tools that leverage existing infrastructure.

**Depends on**: Phase 6 (cross-tool features working)

---

## 7.1 Image to Pattern (`/convert`)

Standalone version of StitchX's image import feature, extracted into its own focused tool.

### What It Does

Upload any image, apply K-means++ color quantization to reduce to DMC thread colors, preview as a cross-stitch pattern, and export to PDF.

### Controls

- **Max colors**: 2-64 (slider)
- **Pattern width**: 50-400 stitches (determines resolution)
- **Background removal**: Toggle (auto-detect dominant background color)
- **Confetti reduction**: Low/Medium/High (merges isolated single-stitch colors)
- **Color matching**: DMC (default), Anchor, or custom palette

### Reuses from StitchX

| Module | Source | Purpose |
|--------|--------|---------|
| `lib/color/kmeans.ts` | `apps/editor` | K-means++ clustering algorithm |
| `lib/color/oklabMatch.ts` | `apps/editor` | OKLab perceptual DMC matching |
| `lib/workers/imageWorker.ts` | `apps/editor` | Web Worker for off-thread processing |
| `@stitch/payment` | `packages/payment` | PDF export gating |
| `@stitch/ui` | `packages/ui` | Header, footer, toast |

### SharedArrayBuffer Optimization

For large images (>2MP), K-means++ on the main thread blocks the UI. The current StitchX implementation uses a Web Worker with `postMessage` which requires copying pixel data. With `SharedArrayBuffer`, the worker reads directly from shared memory -- eliminating the copy.

```typescript
// apps/convert/src/workers/kmeansWorker.ts

self.onmessage = (e: MessageEvent) => {
  const { buffer, width, height, k, maxIterations } = e.data

  // SharedArrayBuffer: zero-copy access to pixel data
  const pixels = new Uint8ClampedArray(buffer)

  const centroids = kmeanspp(pixels, width, height, k, maxIterations, (iteration, centroids) => {
    // Report progress for progressive rendering
    self.postMessage({ type: 'progress', iteration, centroids })
  })

  self.postMessage({ type: 'complete', centroids })
}
```

```typescript
// apps/convert/src/hooks/useQuantize.ts

export function useQuantize() {
  const workerRef = useRef<Worker | null>(null)

  const quantize = useCallback(async (
    imageData: ImageData,
    maxColors: number,
  ): Promise<QuantizeResult> => {
    const worker = new Worker(
      new URL('../workers/kmeansWorker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    // Use SharedArrayBuffer if available (requires COOP/COEP headers)
    const useShared = typeof SharedArrayBuffer !== 'undefined'
    let buffer: ArrayBuffer | SharedArrayBuffer

    if (useShared) {
      buffer = new SharedArrayBuffer(imageData.data.byteLength)
      new Uint8ClampedArray(buffer).set(imageData.data)
    } else {
      buffer = imageData.data.buffer
    }

    return new Promise((resolve) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'progress') {
          // Update preview with intermediate centroids
          onProgress?.(e.data.iteration, e.data.centroids)
        }
        if (e.data.type === 'complete') {
          resolve(e.data.centroids)
          worker.terminate()
        }
      }

      worker.postMessage(
        { buffer, width: imageData.width, height: imageData.height, k: maxColors, maxIterations: 20 },
        useShared ? [] : [buffer],  // Transfer only if not SharedArrayBuffer
      )
    })
  }, [])

  return { quantize, cancel: () => workerRef.current?.terminate() }
}
```

### COOP/COEP Headers Requirement

`SharedArrayBuffer` requires cross-origin isolation headers. Configure in Vercel:

```json
// apps/convert/vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        }
      ]
    }
  ]
}
```

**Important**: COOP/COEP breaks some third-party embeds (e.g., Lemon Squeezy checkout iframe). Solution: open the payment checkout in a popup window instead of an iframe when COEP is active.

```typescript
// packages/payment/src/checkout.ts

export function openCheckout(plan: Plan, options: { usePopup?: boolean } = {}) {
  const url = getLemonSqueezyUrl(plan)

  if (options.usePopup || isCrossOriginIsolated()) {
    // COEP active: iframe won't work, use popup
    window.open(url, 'stitch-checkout', 'width=500,height=700')
  } else {
    // Standard: overlay iframe
    LemonSqueezy.Url.Open(url)
  }
}

function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}
```

### Progressive Rendering

Show K-means iterations as they converge, so the user sees the pattern forming in real time instead of waiting for a blank screen:

```
Iteration 1:  [blurry, wrong colors]     -> Show immediately
Iteration 5:  [shapes forming]           -> Update canvas
Iteration 10: [colors stabilizing]       -> Update canvas
Iteration 15: [nearly final]             -> Update canvas
Iteration 20: [converged]               -> Final result
```

```tsx
// apps/convert/src/components/PreviewCanvas.tsx

export function PreviewCanvas({ imageData, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [iteration, setIteration] = useState(0)

  const { quantize } = useQuantize()

  useEffect(() => {
    if (!imageData) return

    quantize(imageData, maxColors, {
      onProgress: (iter, centroids) => {
        setIteration(iter)
        // Render intermediate result to canvas
        renderQuantized(canvasRef.current!, imageData, centroids)
      },
    })
  }, [imageData, maxColors])

  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height} />
      {iteration > 0 && iteration < 20 && (
        <div className="progress">
          Optimizing colors... step {iteration}/20
        </div>
      )}
    </div>
  )
}
```

### Performance Targets

| Metric | JavaScript (current) | WASM (future) |
|--------|---------------------|---------------|
| 1MP image, 16 colors | <3s | <1s |
| 2MP image, 32 colors | <6s | <2s |
| 4MP image, 64 colors | <12s | <3s |

JavaScript target is achievable with Web Workers. WASM target uses Rust compiled to `wasm32-unknown-unknown` with `wasm-bindgen` -- planned for a future optimization pass.

---

## 7.2 Font Browser (`/fonts`)

Public font showcase and inspector, extracted from the ttf2stitch font inspector tool.

### Features

- Browse all 310+ bitmap fonts with live preview
- Filter by category (serif, sans-serif, script, decorative, pixel)
- Filter by height range (5-40 stitches)
- Search by name or tag
- Preview any text with each font (live input)
- Download individual font JSON files (free)
- "Use in Text Tool" button navigates to `/text?f=<font>`
- Font detail page: full glyph table, metrics, specimen sheet

### Component Structure

```
apps/fonts/src/
├── App.tsx
├── pages/
│   ├── BrowsePage.tsx        # Grid of all fonts with filters
│   └── FontDetailPage.tsx    # Individual font: glyphs, metrics, specimen
├── components/
│   ├── FontGrid.tsx          # Virtual grid (react-window) of FontCards
│   ├── FontFilters.tsx       # Category, height range, search
│   ├── GlyphTable.tsx        # Full glyph table for a single font
│   └── SpecimenSheet.tsx     # Full alphabet + pangrams rendered
└── store/
    └── useBrowserStore.ts    # Zustand: search, filters, selected font
```

### Data Source

Font metadata served from the hub API (cached aggressively):

```typescript
// apps/web/app/api/fonts/route.ts
import { NextResponse } from 'next/server'
import manifest from '@stitch/fonts/catalog'

export async function GET() {
  return NextResponse.json(manifest, {
    headers: {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
```

---

## 7.3 Palette Builder (`/palette`)

DMC color palette creation, management, and sharing tool.

### Features

- Browse 500+ DMC thread colors with search and filtering
- Create named palettes (drag-and-drop color ordering)
- Color grouping by hue family (reds, blues, greens, etc.)
- Share palettes via URL (encoded in query params, like Word2Stitch)
- Import palette into StitchX editor (via "Open in Editor" with palette)
- Export as PDF color card with thread codes and names (paid)
- Print-friendly preview with actual DMC thread swatches

### Component Structure

```
apps/palette/src/
├── App.tsx
├── components/
│   ├── ColorCatalog.tsx       # Full DMC catalog with search, virtual grid
│   ├── PaletteBuilder.tsx     # Selected colors with drag reorder
│   ├── ColorCard.tsx          # Individual color: swatch, code, name, family
│   ├── PalettePreview.tsx     # Print-preview of the palette as PDF card
│   └── SharePalette.tsx       # URL encoding + clipboard
└── store/
    └── usePaletteStore.ts     # Zustand: selected colors, palette name, order
```

### URL Sharing Scheme

```
stitchx.com/palette?n=MyPalette&c=310,321,498,666,815,3801

n = palette name (URL-encoded)
c = comma-separated DMC codes (compact, max ~200 colors in URL)
```

---

## 7.4 Community Gallery (`/gallery`)

Pattern sharing and discovery platform. This is the most complex future tool as it requires a backend for user submissions.

### Features

- Browse community-submitted patterns with thumbnails
- Filter by category (animals, flowers, quotes, holidays, geometric)
- Filter by difficulty (beginner, intermediate, advanced)
- Filter by size (small <50 stitches, medium <150, large 150+)
- Free preview of any pattern
- "Open in Editor" for remixing (free)
- PDF download (paid, uses `@stitch/payment` credits)
- User submissions via JSON v2 upload

### Backend Requirements (Future)

| Service | Purpose | Options |
|---------|---------|---------|
| Storage | Pattern JSON files | Vercel Blob, S3, R2 |
| Database | Pattern metadata, tags, votes | Vercel Postgres, Supabase |
| Auth | User accounts for submissions | NextAuth.js, Clerk |
| Thumbnails | Pattern preview images | Generated at upload time |

The gallery is the only tool that requires server-side persistence beyond localStorage. It is intentionally deferred to Phase 7+ because it requires backend infrastructure decisions that do not affect the core platform.

---

## 7.5 Tool Summary

| Tool | Route | Status | Revenue | Backend |
|------|-------|--------|---------|---------|
| Pattern Editor | `/editor` | Phase 3 | PDF export (paid) | None (client-side) |
| Text to Pattern | `/text` | Phase 5 | PDF export (paid) | Python rasterize API |
| Image to Pattern | `/convert` | Phase 7 | PDF export (paid) | None (client-side) |
| Font Browser | `/fonts` | Phase 7 | Free (drives text tool) | Font manifest API |
| Palette Builder | `/palette` | Phase 7 | PDF color card (paid) | None (client-side) |
| Gallery | `/gallery` | Phase 7+ | PDF download (paid) | Full backend needed |

---

## 7.6 Verification Checklist

### Image to Pattern

- [ ] Image upload works (JPEG, PNG, WebP)
- [ ] K-means++ quantization runs in Web Worker (no main thread blocking)
- [ ] SharedArrayBuffer used when COOP/COEP headers present
- [ ] Progressive rendering shows intermediate iterations
- [ ] DMC color matching produces visually correct results
- [ ] Background removal toggle works
- [ ] Confetti reduction at all 3 levels works
- [ ] Performance: <3s for 1MP image with 16 colors (JS target)
- [ ] "Open in Editor" sends pattern to StitchX correctly
- [ ] PDF export gated by `@stitch/payment`
- [ ] COEP-aware payment checkout (popup fallback for iframe)

### Font Browser

- [ ] All 310+ fonts load and display in virtual grid
- [ ] Category and height filters work correctly
- [ ] Search returns relevant results
- [ ] Font detail page shows full glyph table
- [ ] "Use in Text Tool" navigates to `/text?f=<font>`
- [ ] Font JSON download works (free)
- [ ] Page is fully SSR-compatible for SEO

### Palette Builder

- [ ] 500+ DMC colors browsable with search
- [ ] Palette creation with drag reorder works
- [ ] URL sharing encodes/decodes correctly
- [ ] PDF color card export gated by payment
- [ ] "Import to Editor" sends palette correctly

### Gallery (Deferred)

- [ ] Pattern upload accepts valid JSON v2
- [ ] Thumbnail generation works
- [ ] Browse/filter/search returns relevant results
- [ ] "Open in Editor" works for community patterns
- [ ] PDF download gated by payment
