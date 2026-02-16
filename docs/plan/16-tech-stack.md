# 16. Tech Stack

> Complete technology inventory for the StitchX platform, organized by layer.

---

## 16.1 Stack Summary

| Layer | Technology | Version | Used In |
|-------|-----------|---------|---------|
| **Monorepo** | Turborepo | ^2.5 | Root — pipeline orchestration |
| **Package Manager** | pnpm | ^10.0 | Root — workspace management, strict hoisting |
| **Hub Framework** | Next.js (App Router) | 15.x | `apps/web/` — landing, pricing, terms, API routes |
| **App Framework** | Vite | 7.x | `apps/editor/`, `apps/text/` — SPA bundling |
| **UI Library** | React | 19.x | All apps + `@stitch/*` packages |
| **Language** | TypeScript | 5.9+ | All apps + packages |
| **State Management** | Zustand | 5.x | `apps/editor/` (7 slices), `apps/text/` (pattern store) |
| **Undo/Redo** | Zundo | 2.x | `apps/editor/` — 50-level undo/redo |
| **Styling** | CSS Modules + inline styles | -- | All apps (no Tailwind in production) |
| **i18n** | i18next + react-i18next | 25.x | All apps via `@stitch/i18n` — 17 languages |
| **PDF Generation** | jsPDF | 4.x | `apps/editor/`, `apps/text/` — paid PDF export |
| **Payment** | Lemon Squeezy | -- | `@stitch/payment` — checkout overlay, webhook, MoR |
| **Credit Storage** | **Vercel KV (Upstash Redis)** | -- | `apps/web/` API routes — server-side credit balance, abuse prevention, email-hash dedup |
| **Rasterization** | Python (fontTools + Pillow + Pydantic) | 3.12+ | `services/rasterize/` — Vercel Python serverless function |
| **React Optimization** | **React Compiler (babel-plugin-react-compiler)** | 0.x | All apps — auto-memoization at build time |
| **Testing (Unit)** | Vitest + Testing Library | -- | `apps/editor/`, `apps/text/`, `packages/*` |
| **Testing (E2E)** | Playwright | -- | `apps/editor/`, `apps/text/` — cross-browser E2E |
| **Testing (Python)** | pytest | -- | `services/rasterize/`, `ttf2stitch` CLI |
| **Linting** | ESLint (shared config) | 9.x | All apps via `@stitch/config` |
| **Formatting** | Prettier | 3.x | All apps — consistent formatting |
| **CI/CD** | GitHub Actions | -- | Lint + typecheck + test + Vercel deploy |
| **Hosting** | Vercel | -- | 3 projects: hub (Next.js), editor (Vite), text (Vite) |
| **Analytics** | @vercel/analytics | -- | `apps/web/` — page views, web vitals |
| **Performance Monitoring** | **Vercel Speed Insights** | -- | All apps — Core Web Vitals tracking, real user metrics |
| **Lighthouse CI** | **Lighthouse CI** | -- | CI pipeline — automated performance audits per PR |
| **Bundle Analysis** | **rollup-plugin-visualizer** | -- | `apps/editor/`, `apps/text/` — treemap visualization of bundle contents |
| **Client Data Fetching** | **SWR** | 2.x | `apps/text/` — font list fetching (`useFontList`), rasterization result caching |
| **Virtual Lists** | react-window | 1.x | `apps/text/`, `apps/fonts/` — virtualized font browser grid (310+ items) |
| **Canvas** | HTML5 Canvas API | -- | `apps/editor/` (hybrid DrawingSource/Pattern), `apps/text/` (pattern preview) |
| **PWA** | Service Worker (Vite PWA plugin) | -- | `apps/editor/` — offline support, auto-versioned cache |
| **Image Processing** | K-means++ (custom) | -- | `apps/editor/` — image import color quantization |
| **Color Matching** | OKLab Delta E | -- | `apps/editor/` — DMC color matching (500+ colors) |
| **File Formats** | OXS, JSON v2, PDF | -- | Import/export across tools |

---

## 16.2 New Additions (R1 Review)

Technologies added after the Round 1 review, with justification:

### Vercel KV (Upstash Redis)

| Aspect | Detail |
|--------|--------|
| **What** | Serverless Redis via Vercel's KV integration (powered by Upstash) |
| **Why** | Server-side credit verification (prevents localStorage tampering), email-hash deduplication (prevents incognito free download abuse), license key recovery |
| **Where** | `apps/web/` API routes and Server Actions |
| **Cost** | Free tier: 256MB storage, 30K daily requests |
| **Alternative rejected** | Vercel Postgres (overkill for key-value), client-only localStorage (no abuse prevention) |

### React Compiler

| Aspect | Detail |
|--------|--------|
| **What** | `babel-plugin-react-compiler` — auto-memoization at build time |
| **Why** | Eliminates manual `React.memo`, `useMemo`, `useCallback` in most cases. Less code, fewer stale closure bugs. |
| **Where** | All React apps and packages (babel config) |
| **Cost** | Zero runtime cost (build-time transformation) |
| **Alternative rejected** | Manual memoization (error-prone, verbose, requires discipline) |

### rollup-plugin-visualizer

| Aspect | Detail |
|--------|--------|
| **What** | Generates interactive treemap of Vite/Rollup bundle contents |
| **Why** | Monitor bundle size budget (150KB initial JS). Detect accidental React duplication across packages. Identify large dependencies. |
| **Where** | `apps/editor/vite.config.ts`, `apps/text/vite.config.ts` |
| **Cost** | Dev dependency only, zero production impact |
| **Alternative rejected** | `@next/bundle-analyzer` (Next.js only, doesn't cover Vite apps) |

### Vercel Speed Insights + Lighthouse CI

| Aspect | Detail |
|--------|--------|
| **What** | Real User Monitoring (RUM) via Speed Insights + automated Lighthouse audits in CI |
| **Why** | Track Core Web Vitals (LCP, CLS, INP) from real users. Catch performance regressions before merge. |
| **Where** | Speed Insights: `apps/web/` layout. Lighthouse CI: GitHub Actions workflow. |
| **Cost** | Speed Insights: free for hobby (2500 data points/month). Lighthouse CI: free (runs in CI). |
| **Alternative rejected** | Google Analytics (heavier, not focused on performance), custom performance tracking (maintenance burden) |

### SWR

| Aspect | Detail |
|--------|--------|
| **What** | React hooks library for data fetching with stale-while-revalidate caching |
| **Why** | Font list in Word2Stitch (`useFontList`) needs client-side fetching with caching, deduplication, and revalidation. SWR is lighter than React Query and pairs well with Vercel infrastructure. |
| **Where** | `apps/text/` — `useFontList.ts`, `useRasterize.ts` |
| **Cost** | ~4KB gzipped |
| **Alternative rejected** | React Query/TanStack Query (heavier, more features than needed), raw `fetch` + `useState` (no caching, no dedup, no revalidation) |

---

## 16.3 Dependency Graph

```
@stitch/config ─────────────────────────────────────────────┐
       │                                                     │
       ▼                                                     │
@stitch/theme ──────────────────────────────────────────┐    │
       │                                                │    │
       ▼                                                │    │
@stitch/i18n ───────────────────────────────────┐       │    │
       │                                        │       │    │
       ▼                                        ▼       ▼    ▼
@stitch/ui ◄──────── @stitch/payment ──────► apps/web (Next.js)
       │                    │                      │
       │                    │                      ├── /api/payment/webhook
       │                    │                      ├── /api/validate-key
       ▼                    ▼                      └── /api/rasterize (Python)
  apps/editor          apps/text
  (Vite + React)       (Vite + React)
       │                    │
       └──── Shared: React 19 (peerDependency) ────┘
```

---

## 16.4 Version Pinning Strategy

| Category | Strategy | Example |
|----------|----------|---------|
| **Frameworks** | Minor range (`^`) | `"next": "^15.0"`, `"vite": "^7.0"` |
| **React** | Exact peer | `"react": "^19.0"` as peerDep in packages |
| **Build tools** | Minor range | `"turbo": "^2.5"`, `"typescript": "^5.9"` |
| **Small utilities** | Minor range | `"zustand": "^5.0"`, `"swr": "^2.0"` |
| **Python** | Exact in requirements.txt | `fonttools==4.55.0`, `Pillow==11.1.0` |

All versions managed via `pnpm` with `pnpm-lock.yaml` for deterministic installs.

---

## 16.5 Runtime Environment

| Environment | Runtime | Region | Notes |
|-------------|---------|--------|-------|
| Hub (Next.js) | Node.js 20 | `iad1` (us-east-1) | Edge for rewrites, serverless for API |
| Editor (Vite) | Static CDN | Global edge | Zero server-side runtime |
| Text (Vite) | Static CDN | Global edge | Zero server-side runtime |
| Rasterize API | Python 3.12 | `iad1` (us-east-1) | Vercel Python function, 2-4s cold start |
| Vercel KV | Upstash Redis | `us-east-1` | <1ms reads from same region |
| CDN Cache | Vercel Edge Network | Global | `Cache-Control: public, max-age=3600` for rasterize responses |
