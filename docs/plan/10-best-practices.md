# 10. Vercel React Best Practices

> Applied across the StitchX platform. Organized by priority level.
> Updated for **React 19.2 + React Compiler** (auto-memoization).

---

## React Compiler Setup

React 19.2 ships with the **React Compiler** (`babel-plugin-react-compiler`), which automatically memoizes components, hooks, and expressions at build time. This eliminates the need for manual `React.memo()`, `useMemo()`, and `useCallback()` in most cases.

```typescript
// apps/editor/vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})
```

```typescript
// apps/text/vite.config.ts — same configuration
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/text/',
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})
```

For the Next.js hub app, enable the compiler in `next.config.ts`:

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/editor/:path*',
          destination: isDev
            ? 'http://localhost:5173/:path*'
            : 'https://stitchx-editor.vercel.app/:path*',
        },
        {
          source: '/text/:path*',
          destination: isDev
            ? 'http://localhost:5174/:path*'
            : 'https://stitchx-text.vercel.app/:path*',
        },
      ],
    }
  },
}

export default config
```

**What the compiler handles automatically:**
- Component memoization (replaces `React.memo()`)
- Derived state computation (replaces `useMemo()` for derived values)
- Callback stability (replaces `useCallback()`)
- Functional `setState` optimization

**What the compiler does NOT handle** (still require manual attention):
- Code splitting and dynamic imports
- Suspense boundaries
- Server component data patterns
- CSS rendering optimizations (`content-visibility`)
- Data structure choices (`Map` vs object)

---

## Critical Priority

These patterns have the highest impact on Core Web Vitals (LCP, INP, CLS).

| Rule | Where | How |
|------|-------|-----|
| `async-parallel` | PDF generation, font loading | `Promise.all([loadThreadEquiv(), loadLogo(), ...])` (already in StitchX) |
| `async-suspense-boundaries` | Hub landing, tool cards, modals | `<Suspense>` around tool cards, lazy-loaded modals |
| `bundle-dynamic-imports` | Payment modals, PDF export, jsPDF | `React.lazy(() => import('@stitch/payment/components/PaymentModal'))` |
| `bundle-barrel-imports` | All `@stitch/*` packages | Named exports only, no `index.ts` barrel re-exports |
| `bundle-defer-third-party` | Analytics, Lemon Squeezy | `<Script strategy="afterInteractive">` for Vercel Analytics |

### Dynamic Import Patterns

```typescript
// Lazy-load payment modals (loaded on user interaction, not at startup)
const PaymentModal = React.lazy(() => import('@stitch/payment/components/PaymentModal'))
const FreeDownloadModal = React.lazy(() => import('@stitch/payment/components/FreeDownloadModal'))
const UpsellModal = React.lazy(() => import('@stitch/payment/components/UpsellModal'))

// Preload jsPDF chunk when export panel mounts (not on app load)
function PDFExportPanel() {
  useEffect(() => {
    const preload = () => import('jspdf')
    // Preload after the panel is visible and idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(preload)
    } else {
      setTimeout(preload, 200)
    }
  }, [])

  // ...
}
```

### Suspense Boundaries

```tsx
// Hub landing — tool cards load independently
<Suspense fallback={<ToolCardsSkeleton />}>
  <ToolCards />
</Suspense>

// Editor — modals loaded on demand
{showPayModal && (
  <Suspense fallback={null}>
    <PaymentModal onClose={closePayModal} />
  </Suspense>
)}
```

---

## High Priority

Server-side patterns for the Next.js hub app (RSC, caching, serialization).

| Rule | Where | How |
|------|-------|-----|
| `server-cache-react` | Hub pricing data | `React.cache(fetchPricingData)` in RSC |
| `server-serialization` | Hub to client components | Pass only primitives, not full objects |
| `server-parallel-fetching` | Hub page data | Parallel fetch for tools + pricing |

### Server Component Caching

```typescript
// apps/web/app/lib/data.ts
import { cache } from 'react'

// Deduplicated per-request: multiple components can call this,
// but it only fetches once per server render
export const getPricingData = cache(async () => {
  const res = await fetch('https://api.lemonsqueezy.com/v1/products', {
    headers: { Authorization: `Bearer ${process.env.LS_API_KEY}` },
    next: { revalidate: 3600 }, // ISR: revalidate every hour
  })
  return res.json()
})
```

### Server-to-Client Serialization

```tsx
// Pass only the data the client component needs, not the full API response
// apps/web/app/pricing/page.tsx (Server Component)
export default async function PricingPage() {
  const data = await getPricingData()

  // Extract only what the client needs
  const plans = data.data.map((p: any) => ({
    id: p.id,
    name: p.attributes.name,
    price: p.attributes.price,
  }))

  return <PricingCards plans={plans} />
}
```

---

## Medium Priority

Rendering and JS optimizations that the React Compiler does NOT handle.

| Rule | Where | How |
|------|-------|-----|
| `rendering-content-visibility` | Font browser, color picker, pattern list | `content-visibility: auto` on off-screen list items |
| `rendering-conditional-render` | Modal rendering | `{show ? <Modal /> : null}` not `{show && <Modal />}` |
| `js-set-map-lookups` | DMC colors (500+), font index | `Map<string, DMCColor>` for O(1) lookup |
| `js-cache-storage` | localStorage reads | Cache `stitch_license` in module-level variable |
| `pre-cache-thread-tables` | Thread equivalence data | Pre-cache on app load via `requestIdleCallback` |
| `content-hash-data-files` | Bitmap JSON, DMC colors | Vite `?url` import for content-hashed static data |

### Content Visibility for Large Lists

```css
/* Font browser — 310+ font cards */
.font-card {
  content-visibility: auto;
  contain-intrinsic-size: 0 120px; /* estimated card height */
}

/* DMC color grid — 449+ color chips */
.color-chip {
  content-visibility: auto;
  contain-intrinsic-size: 32px 32px;
}
```

### Pre-cache Thread Tables on App Load

Thread equivalence tables (Anchor, Madeira, etc.) are used in PDF export. Pre-cache them during idle time so export is instant.

```typescript
// apps/editor/src/lib/threadPreloader.ts

const THREAD_TABLE_URLS = [
  '/data/threads/anchor.json',
  '/data/threads/madeira.json',
  '/data/threads/cosmo.json',
]

export function preCacheThreadTables(): void {
  const load = () => {
    THREAD_TABLE_URLS.forEach((url) => {
      fetch(url).then((res) => {
        if (res.ok) res.json() // parse into memory, browser caches the fetch
      })
    })
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(load, { timeout: 5000 })
  } else {
    setTimeout(load, 2000)
  }
}
```

```typescript
// apps/editor/src/App.tsx
import { preCacheThreadTables } from './lib/threadPreloader'

function App() {
  useEffect(() => {
    preCacheThreadTables()
  }, [])
  // ...
}
```

### Content-Hashed Data Files via Vite

Use Vite's `?url` import to generate content-hashed filenames for static data files. This enables aggressive browser caching (immutable) while ensuring cache-busting on content changes.

```typescript
// Import the content-hashed URL at build time
import dmcColorsUrl from '../data/dmc-colors.json?url'
// Result: '/assets/dmc-colors-a1b2c3d4.json'

import anchorThreadsUrl from '../data/threads/anchor.json?url'
// Result: '/assets/anchor-e5f6g7h8.json'

// Fetch using the hashed URL — browser caches aggressively
const response = await fetch(dmcColorsUrl)
```

```typescript
// vite.config.ts — ensure JSON files are treated as assets
export default defineConfig({
  assetsInclude: ['**/*.json'],
  build: {
    rollupOptions: {
      output: {
        // Content-hashed chunks
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
```

### Map for O(1) Color Lookups

```typescript
// Build once, use everywhere
const DMC_MAP = new Map<string, DMCColor>(
  dmcColors.map((c) => [c.code, c])
)

// O(1) lookup instead of Array.find()
function getDMCColor(code: string): DMCColor | undefined {
  return DMC_MAP.get(code)
}
```

### Module-Level localStorage Cache

```typescript
// packages/payment/src/keyManager.ts

// Cache in module scope to avoid repeated localStorage reads
let cachedLicense: LicenseKey | null = null

export function loadLicense(): LicenseKey | null {
  if (cachedLicense) return cachedLicense
  try {
    const raw = localStorage.getItem('stitch_license')
    if (raw) cachedLicense = JSON.parse(raw)
  } catch {
    // Corrupted data — ignore
  }
  return cachedLicense
}

export function saveLicense(license: LicenseKey): void {
  cachedLicense = license
  try {
    localStorage.setItem('stitch_license', JSON.stringify(license))
  } catch {
    // Storage full — degrade gracefully
  }
}
```

---

## Low Priority

Micro-optimizations with small but measurable gains.

| Rule | Where | How |
|------|-------|-----|
| `rendering-svg-precision` | Payment logos, tool icons | Reduce SVG decimal places to 1-2 |
| `js-early-exit` | Validation functions | Return early on invalid input |
| `advanced-event-handler-refs` | Canvas interactions | `useRef` for handlers in hot paths (compiler handles most cases) |

### SVG Optimization

```bash
# Run SVGO on all SVGs in the project
npx svgo --config='{"plugins":[{"name":"cleanupNumericValues","params":{"floatPrecision":1}}]}' -r apps/web/public/icons/
```

### Early Exit Pattern

```typescript
function validateLicenseKey(key: string): ValidationResult {
  if (!key) return { valid: false, error: 'empty' }
  if (key.length < 16) return { valid: false, error: 'too_short' }
  if (!/^[A-Z0-9-]+$/.test(key)) return { valid: false, error: 'invalid_chars' }

  // Expensive validation only after cheap checks pass
  return validateWithServer(key)
}
```

---

## Package-Specific Notes

### Hub (Next.js 15 — `apps/web/`)

- All marketing pages are **React Server Components** — zero client JS
- Use `React.cache()` for data deduplication within a request
- Use `next/dynamic` for client components that aren't needed at initial render
- Use `<Script strategy="afterInteractive">` for analytics

### Editor (Vite — `apps/editor/`)

- React Compiler handles all memoization
- Focus on code splitting: jsPDF (~150KB), payment modals, tool panels
- Canvas rendering is outside React — use `useRef` for canvas context
- Web Workers for image quantization (K-means++) are already isolated

### Text (Vite — `apps/text/`)

- Smallest bundle of the three apps
- Critical path: text input -> rasterize API -> canvas render
- Pre-fetch font list during idle time
- Cache rasterization results (same params = same bitmap)
