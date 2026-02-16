# 11. Performance Budgets & Monitoring

> Measurable targets for load time, bundle size, and API response time across the StitchX platform.

---

## Core Web Vitals Targets

Targets per app, measured at the 75th percentile (p75) on mobile 4G.

| Metric | Hub (`/`) | Editor (`/editor`) | Text (`/text`) | Threshold |
|--------|-----------|---------------------|----------------|-----------|
| **LCP** (Largest Contentful Paint) | < 1.5s | < 2.0s | < 1.8s | Good: < 2.5s |
| **INP** (Interaction to Next Paint) | < 100ms | < 150ms | < 100ms | Good: < 200ms |
| **CLS** (Cumulative Layout Shift) | < 0.05 | < 0.1 | < 0.05 | Good: < 0.1 |
| **FCP** (First Contentful Paint) | < 1.0s | < 1.5s | < 1.2s | Good: < 1.8s |
| **TTFB** (Time to First Byte) | < 200ms | < 100ms | < 100ms | Good: < 800ms |

**Why different targets per app:**
- **Hub**: Server-rendered (Next.js RSC), should be fastest — marketing page with no client JS
- **Editor**: Canvas SPA with complex state, slightly relaxed LCP for initial canvas render
- **Text**: Middle ground — SPA but lighter than editor, simple UI

---

## Bundle Size Budgets

| Budget | Target | Hard Limit | Measured As |
|--------|--------|------------|-------------|
| **Initial JS** (per app) | < 150 KB gzip | < 200 KB gzip | All JS loaded before first interaction |
| **PDF chunk** (jsPDF + export logic) | < 120 KB gzip | < 150 KB gzip | Lazy-loaded on export action |
| **Payment modal chunk** | < 25 KB gzip | < 40 KB gzip | Lazy-loaded on payment trigger |
| **i18n language pack** | < 8 KB gzip | < 15 KB gzip | Lazy-loaded per language |
| **Total app JS** (all chunks) | < 350 KB gzip | < 500 KB gzip | Everything including lazy chunks |
| **CSS** (per app) | < 30 KB gzip | < 50 KB gzip | All stylesheets |
| **Hub initial JS** | < 50 KB gzip | < 80 KB gzip | RSC pages ship minimal client JS |

### Bundle Composition Target

```
Editor (apps/editor/) — Total: ~320 KB gzip
├── React + ReactDOM ........... ~45 KB
├── Zustand + Zundo ............ ~5 KB
├── App core (canvas, tools) ... ~80 KB
├── i18next .................... ~12 KB
├── [lazy] jsPDF + export ...... ~120 KB
├── [lazy] Payment modals ...... ~25 KB
├── [lazy] Image quantizer ..... ~15 KB
└── [lazy] Language packs ...... ~8 KB each

Text (apps/text/) — Total: ~180 KB gzip
├── React + ReactDOM ........... ~45 KB
├── Zustand .................... ~3 KB
├── App core (canvas, controls)  ~40 KB
├── i18next .................... ~12 KB
├── [lazy] jsPDF + export ...... ~50 KB
├── [lazy] Payment modals ...... ~25 KB
└── [lazy] Language packs ...... ~8 KB each
```

---

## API Response Time Budgets

### Rasterization API (`/api/rasterize`)

| Scenario | Target | Hard Limit | Notes |
|----------|--------|------------|-------|
| **Cached** (CDN hit) | < 50 ms | < 100 ms | `Cache-Control: public, max-age=3600` |
| **Warm** (server hot, no cache) | < 300 ms | < 500 ms | Python process already running |
| **Cold start** (first request) | < 2 s | < 4 s | Vercel Python function init |

### Other API Endpoints

| Endpoint | Target | Notes |
|----------|--------|-------|
| `GET /api/fonts` | < 50 ms | Static JSON, CDN-cached |
| `POST /api/payment/webhook` | < 500 ms | Lemon Squeezy webhook processing |
| `POST /api/validate-key` | < 200 ms | License key validation |
| `GET /api/manifest` | < 50 ms | Font manifest, CDN-cached |

---

## Python Cold Start Mitigation

Vercel Python serverless functions have a cold start penalty of 1-3 seconds. Three-layer mitigation strategy:

### Layer 1: CDN Cache (eliminates most cold starts)

```python
# services/rasterize/api/index.py
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # ... process request ...

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        # Cache identical requests for 1 hour at CDN level
        self.send_header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
```

### Layer 2: Vercel Cron Pre-warm

Keep the function warm by pinging it every 5 minutes via Vercel Cron Jobs.

```json
// apps/web/vercel.json
{
  "crons": [
    {
      "path": "/api/rasterize/warm",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

```python
# services/rasterize/api/warm.py
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Lightweight warm-up endpoint. Keeps the Python runtime alive."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"warm"}')
```

### Layer 3: Railway/Fly.io Fallback

If Vercel cold starts remain problematic, deploy the rasterization API as an always-on container.

```typescript
// apps/text/src/hooks/useRasterize.ts
const API_PRIMARY = '/api/rasterize'
const API_FALLBACK = 'https://stitchx-rasterize.railway.app/api/rasterize'

async function rasterize(params: RasterizeParams): Promise<RasterizeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    const res = await fetch(API_PRIMARY, {
      method: 'POST',
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.json()
  } catch {
    clearTimeout(timeout)
    // Fallback to always-on Railway instance
    const res = await fetch(API_FALLBACK, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    return res.json()
  }
}
```

---

## Asset Caching Strategy

### Cache Headers by Asset Type

| Asset Type | Browser Cache | CDN Cache | Cache-Control Header |
|------------|--------------|-----------|---------------------|
| **Bitmap font JSON** | 30 days | 1 year | `public, max-age=2592000, s-maxage=31536000, immutable` |
| **Thread equivalence tables** | 1 year | 1 year | `public, max-age=31536000, immutable` |
| **DMC color data** | 1 year | 1 year | `public, max-age=31536000, immutable` |
| **Hashed JS/CSS chunks** | 1 year | 1 year | `public, max-age=31536000, immutable` |
| **index.html / app shell** | 0 (revalidate) | 60 s | `public, max-age=0, s-maxage=60, stale-while-revalidate=3600` |
| **API responses** (`/api/rasterize`) | 0 | 1 hour | `public, s-maxage=3600, stale-while-revalidate=86400` |
| **Font list** (`/api/fonts`) | 5 min | 1 day | `public, max-age=300, s-maxage=86400` |
| **i18n language packs** | 7 days | 30 days | `public, max-age=604800, s-maxage=2592000` |

### Vercel Headers Configuration

```json
// apps/web/vercel.json
{
  "headers": [
    {
      "source": "/data/fonts/(.*).json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=2592000, s-maxage=31536000, immutable" }
      ]
    },
    {
      "source": "/data/threads/(.*).json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/data/dmc-colors.json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

---

## Monitoring Setup

### Vercel Speed Insights

```typescript
// apps/editor/src/main.tsx
import { injectSpeedInsights } from '@vercel/speed-insights'

injectSpeedInsights()
```

```typescript
// apps/web/app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

### Vercel Analytics

```typescript
// apps/web/app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Bundle Analyzer

```typescript
// apps/editor/vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react({
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
    visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // 'sunburst' | 'network' also available
    }),
  ],
})
```

```typescript
// apps/text/vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  base: '/text/',
  plugins: [
    react({
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
    visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ],
})
```

---

## Lighthouse CI in GitHub Actions

Automated performance regression testing on every PR.

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build all apps
        run: pnpm turbo run build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: .lighthouserc.json
          uploadArtifacts: true
```

```json
// .lighthouserc.json
{
  "ci": {
    "collect": {
      "staticDistDir": "apps/editor/dist",
      "url": [
        "http://localhost/editor/",
        "http://localhost/text/"
      ]
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["warn", { "minScore": 0.95 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "interactive": ["error", { "maxNumericValue": 3500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-byte-weight": ["warn", { "maxNumericValue": 500000 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

---

## Performance Budget Enforcement in CI

### Bundle Size Check

```yaml
# .github/workflows/bundle-size.yml
name: Bundle Size Check

on:
  pull_request:
    branches: [main]

jobs:
  bundle-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install and build
        run: pnpm install && pnpm turbo run build

      - name: Check editor bundle size
        run: |
          EDITOR_SIZE=$(find apps/editor/dist/assets -name '*.js' -exec gzip -c {} + | wc -c)
          EDITOR_KB=$((EDITOR_SIZE / 1024))
          echo "Editor JS bundle: ${EDITOR_KB} KB gzip"
          if [ "$EDITOR_KB" -gt 200 ]; then
            echo "::error::Editor initial JS exceeds 200 KB gzip budget (${EDITOR_KB} KB)"
            exit 1
          fi

      - name: Check text bundle size
        run: |
          TEXT_SIZE=$(find apps/text/dist/assets -name '*.js' -exec gzip -c {} + | wc -c)
          TEXT_KB=$((TEXT_SIZE / 1024))
          echo "Text JS bundle: ${TEXT_KB} KB gzip"
          if [ "$TEXT_KB" -gt 200 ]; then
            echo "::error::Text initial JS exceeds 200 KB gzip budget (${TEXT_KB} KB)"
            exit 1
          fi
```

### Import Cost Linting (Optional)

Add `eslint-plugin-import` rules to prevent accidentally importing heavy modules synchronously:

```javascript
// packages/config/eslint/base.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['jspdf'],
          message: 'Import jsPDF dynamically: const { jsPDF } = await import("jspdf")',
        },
      ],
    }],
  },
}
```

---

## Performance Testing Checklist

Run before each release:

- [ ] Lighthouse score > 90 (performance) on all three apps
- [ ] Initial JS < 200 KB gzip per app
- [ ] LCP < 2.5s on mobile 4G (WebPageTest)
- [ ] INP < 200ms for common interactions (click export, change font, type text)
- [ ] CLS < 0.1 (no layout shifts from lazy-loaded content)
- [ ] Rasterize API < 500ms warm, < 4s cold
- [ ] PDF export < 3s for a typical pattern
- [ ] Font list loads < 1s (CDN-cached)
- [ ] Bundle visualizer reviewed — no unexpected large chunks
- [ ] No render-blocking third-party scripts
