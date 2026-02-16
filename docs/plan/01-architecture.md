# 01 — Architecture

> Monorepo structure, deployment topology, and key technical decisions.
> Date: 2026-02-16 | Source: STITCHINGBUNDLE.md Section 3, with R1 fixes

---

## Monorepo Structure (Turborepo + pnpm)

```
stitchx-platform/
├── turbo.json                        # Pipeline: build, dev, lint, test, typecheck
├── pnpm-workspace.yaml               # packages: ['apps/*', 'packages/*', 'services/*']
├── package.json                      # Root: turbo scripts, pnpm config
├── .npmrc                            # React peerDependency hoisting config
├── .github/workflows/ci.yml          # Unified CI
│
├── apps/
│   ├── web/                          # === Next.js 15 App Router ===
│   │   ├── api/                      # Vercel Functions (root-level, NOT inside app/)
│   │   │   └── rasterize.py          # Python serverless (ttf2stitch core)
│   │   ├── app/
│   │   │   ├── layout.tsx            # RootLayout: SharedHeader + SharedFooter
│   │   │   ├── page.tsx              # Landing: tool showcase (RSC, zero client JS)
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx          # Unified pricing (SSR for SEO)
│   │   │   ├── terms/
│   │   │   │   └── page.tsx          # Terms of service (SSR)
│   │   │   ├── blog/                 # Future: content marketing
│   │   │   └── api/
│   │   │       ├── payment/
│   │   │       │   └── webhook/route.ts   # Lemon Squeezy webhook handler
│   │   │       ├── validate-key/
│   │   │       │   └── route.ts           # License key validation
│   │   │       └── recover/
│   │   │           └── route.ts           # Key recovery by email
│   │   ├── next.config.ts            # rewrites to editor/text deployments
│   │   ├── vercel.json
│   │   └── package.json              # deps: next, @stitch/ui, @stitch/theme
│   │
│   ├── editor/                       # === StitchX (Vite + React 19) ===
│   │   ├── src/                      # Existing StitchX source (minimal changes)
│   │   ├── vite.config.ts            # base: '/editor/'
│   │   ├── vercel.json
│   │   └── package.json              # adds @stitch/payment, @stitch/ui deps
│   │
│   └── text/                         # === Word2Stitch React (Vite + React 19) ===
│       ├── src/
│       │   ├── App.tsx               # Main app shell
│       │   ├── components/
│       │   │   ├── TextInput/        # Text area + font picker
│       │   │   ├── PatternPreview/   # Canvas preview (renders bitmap)
│       │   │   ├── FontBrowser/      # Font grid with search + categories
│       │   │   ├── Controls/         # Height slider, color, aida, alignment
│       │   │   └── ShareButton/      # URL encode + clipboard copy
│       │   ├── hooks/
│       │   │   ├── useRasterize.ts   # Calls /api/rasterize, caches results
│       │   │   └── useFontList.ts    # Fetches /api/fonts
│       │   └── store/
│       │       └── patternStore.ts   # Zustand: text, font, height, color, aida, align
│       ├── vite.config.ts            # base: '/text/'
│       ├── vercel.json
│       └── package.json              # deps: react, zustand, @stitch/payment, @stitch/ui
│
├── packages/
│   ├── ui/                           # === @stitch/ui ===
│   │   ├── src/
│   │   │   ├── SharedHeader.tsx      # Logo + tool switcher nav + lang select
│   │   │   ├── SharedFooter.tsx      # Links, copyright
│   │   │   ├── Toast.tsx             # Toast notification system
│   │   │   ├── LangSelect.tsx        # 17-language selector dropdown
│   │   │   └── index.ts             # Named exports (no barrel re-exports)
│   │   ├── package.json              # "name": "@stitch/ui"
│   │   └── tsconfig.json
│   │
│   ├── payment/                      # === @stitch/payment ===
│   │   ├── src/
│   │   │   ├── PaymentProvider.tsx   # React Context: credits, key, subscription status
│   │   │   ├── usePayment.ts        # Hook: openCheckout(), validateKey(), getCredits()
│   │   │   ├── usePaymentGate.ts    # Hook: wraps PDF download with payment check
│   │   │   ├── checkout.ts          # Lemon Squeezy overlay checkout
│   │   │   ├── keyManager.ts        # localStorage key storage + validation
│   │   │   ├── api.ts               # Server: webhook handler, key validation logic
│   │   │   ├── types.ts             # LicenseKey, CreditBalance, Plan, etc.
│   │   │   └── components/
│   │   │       ├── PaymentModal.tsx      # Generalized 3-tier payment modal
│   │   │       ├── PaymentModal.module.css
│   │   │       ├── FreeDownloadModal.tsx  # Email capture for first free download
│   │   │       └── UpsellModal.tsx       # Post-purchase upsell
│   │   ├── package.json              # "name": "@stitch/payment"
│   │   └── tsconfig.json
│   │
│   ├── i18n/                         # === @stitch/i18n ===
│   │   ├── locales/
│   │   │   ├── en/
│   │   │   │   ├── payment.json     # Payment strings (modal, toast, errors)
│   │   │   │   └── common.json      # Shared UI strings (header, footer, etc.)
│   │   │   ├── es/
│   │   │   │   ├── payment.json
│   │   │   │   └── common.json
│   │   │   └── ... (17 languages)
│   │   ├── src/
│   │   │   └── index.ts             # i18next config factory, language detector
│   │   └── package.json              # "name": "@stitch/i18n"
│   │
│   ├── theme/                        # === @stitch/theme ===
│   │   ├── tokens.ts                 # Color, font, spacing, radius tokens
│   │   ├── global.css                # CSS custom properties
│   │   └── package.json              # "name": "@stitch/theme"
│   │
│   └── config/                       # === @stitch/config ===
│       ├── eslint/
│       │   └── base.js               # Shared ESLint config
│       ├── typescript/
│       │   └── base.json             # Shared tsconfig
│       └── package.json              # "name": "@stitch/config"
│
└── services/
    └── rasterize/                    # === Python rasterization ===
        ├── api/
        │   └── index.py              # Vercel Python serverless function
        ├── requirements.txt          # fonttools, Pillow, pydantic
        └── core/                     # Extracted from ttf2stitch
            ├── rasterizer.py         # General font rasterization
            ├── renderer.py           # PIL high-res rendering
            ├── sampler.py            # Cell center sampling
            ├── config.py             # Constants, thresholds
            └── schema.py             # Pydantic v2 models
```

---

## Critical Configuration Files

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

> `services/*` is required so that `services/rasterize/` participates in the workspace
> and its dependencies can be managed by pnpm.

### `.npmrc`

```ini
# Hoist React so all workspace packages share the same React instance.
# Without this, @stitch/* packages may bundle a separate React copy,
# causing the "multiple React instances" error.
public-hoist-pattern[]=react
public-hoist-pattern[]=react-dom
```

### `turbo.json`

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json", "vite.config.*", "next.config.*"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["VITE_*", "NEXT_PUBLIC_*", "LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_WEBHOOK_SECRET"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "inputs": ["src/**", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tests/**", "vitest.config.*"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Key differences from the original draft:

| Field | Original | R1 Fix | Why |
|-------|----------|--------|-----|
| `inputs` | Missing | Explicit per task | Prevents cache invalidation on unrelated changes |
| `outputs` | `!.next/cache/**` only | Same | Turbo should not cache Next.js's own cache |
| `env` | `VITE_*`, `NEXT_PUBLIC_*` | + `LEMON_SQUEEZY_*` | Payment secrets must invalidate build cache when rotated |
| `typecheck.dependsOn` | `["^build"]` | `["^typecheck"]` | Only needs types from deps, not full builds |

### TypeScript Project References

For faster type-checking, each package declares `references` to its dependencies:

```jsonc
// apps/editor/tsconfig.json
{
  "extends": "@stitch/config/typescript/base.json",
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "references": [
    { "path": "../../packages/ui" },
    { "path": "../../packages/payment" },
    { "path": "../../packages/i18n" },
    { "path": "../../packages/theme" }
  ]
}
```

> **Path alias**: Use `~/` (not `@/`) to avoid collision with the `@stitch/` package scope.
> `@/components/Foo` is ambiguous — is it a local import or `@stitch/components/Foo`?
> `~/components/Foo` is unambiguously local.

---

## Vercel Multi-Project Deployment

Three Vercel projects from one monorepo, composed under one domain via rewrites:

```
┌─────────────────────────────────────────────────────────────┐
│  stitchx.com (Vercel Project: "stitchx-hub")                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js App Router (apps/web/)                      │   │
│  │  /           -> Landing page (RSC)                   │   │
│  │  /pricing    -> Pricing page (RSC)                   │   │
│  │  /terms      -> Terms of service (RSC)               │   │
│  │  /api/*      -> Payment API (TS), rasterize API (Py) │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Rewrites (beforeFiles — resolved at edge):                 │
│  /editor/*  -->  stitchx-editor.vercel.app/*                │
│  /text/*    -->  stitchx-text.vercel.app/*                  │
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────┐     │
│  │  StitchX Editor     │  │  Word2Stitch Text        │     │
│  │  (Vite static)      │  │  (Vite static)           │     │
│  │  apps/editor/       │  │  apps/text/              │     │
│  └─────────────────────┘  └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Hub `next.config.ts` — Rewrites with Dev/Prod Conditional

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
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

> **Why `beforeFiles`?** Rewrites in the `beforeFiles` array are resolved at the **edge layer**
> before any filesystem lookup or serverless function invocation. This avoids a cold-start
> penalty on every `/editor/*` or `/text/*` request.

> **Why `isDev`?** In development, the Vite apps run on localhost. Without this conditional,
> `turbo dev` would proxy to the production Vercel URLs, which defeats local development.

### Alternative: Edge Middleware Approach

If you need more control (e.g., A/B testing, geo-routing, auth checks before rewrite), you can use Edge Middleware instead of `next.config.ts` rewrites:

```typescript
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'

const isDev = process.env.NODE_ENV === 'development'

const REWRITES: Record<string, string> = {
  '/editor': isDev ? 'http://localhost:5173' : 'https://stitchx-editor.vercel.app',
  '/text': isDev ? 'http://localhost:5174' : 'https://stitchx-text.vercel.app',
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  for (const [prefix, target] of Object.entries(REWRITES)) {
    if (pathname.startsWith(prefix)) {
      const newPath = pathname.replace(prefix, '') || '/'
      return NextResponse.rewrite(new URL(newPath, target))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/editor/:path*', '/text/:path*'],
}
```

> Trade-off: Middleware runs on **every matched request** (including static assets).
> `beforeFiles` rewrites are cheaper for simple URL mapping.
> Use Middleware only if you need conditional logic (auth, geo, experiments).

---

## Python API Routes — Vercel Functions

> **CRITICAL**: Python API routes go at `apps/web/api/rasterize.py` (root-level Vercel
> Functions directory), **NOT** inside Next.js App Router `app/api/`.
> Next.js App Router does **NOT** support Python route handlers. Only TypeScript/JavaScript
> `route.ts` files work inside `app/api/`. Python functions must use Vercel's
> root-level `/api` directory convention.

Directory layout for `apps/web/`:

```
apps/web/
├── api/                          # <-- Vercel Functions (root-level)
│   └── rasterize.py              # Python serverless function
├── app/                          # <-- Next.js App Router
│   └── api/
│       ├── payment/webhook/route.ts   # TypeScript route handler (OK)
│       ├── validate-key/route.ts      # TypeScript route handler (OK)
│       └── recover/route.ts           # TypeScript route handler (OK)
├── next.config.ts
└── vercel.json
```

The `vercel.json` must include Python runtime configuration:

```json
{
  "functions": {
    "api/rasterize.py": {
      "runtime": "@vercel/python@4.5",
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

---

## Vite Configuration for Monorepo

### HMR Fix: Exclude `@stitch/*` from Dependency Optimization

Vite pre-bundles dependencies by default, which breaks HMR for workspace packages (changes to `@stitch/ui` would require a full reload). Fix:

```typescript
// apps/editor/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/editor/',
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Do NOT pre-bundle workspace packages — let Vite process them as source
    exclude: ['@stitch/ui', '@stitch/payment', '@stitch/i18n', '@stitch/theme'],
  },
  server: {
    watch: {
      // Ignore node_modules EXCEPT @stitch/* packages (which are symlinked)
      ignored: ['!**/node_modules/@stitch/**'],
    },
  },
})
```

> Without `optimizeDeps.exclude`, Vite treats `@stitch/*` as external node_modules and
> pre-bundles them once at startup. Subsequent edits to those packages are invisible until
> you restart the dev server.

> Without `server.watch.ignored` override, Vite's file watcher ignores all of `node_modules/`,
> including the symlinked `@stitch/*` packages, so HMR does not fire.

---

## Key Architecture Decision: Why Not One Next.js App?

StitchX is a **canvas-based SPA** with complex client-side state (Zustand, 7 slices, undo/redo, 50 levels). It has 2200+ tests tied to Vite. Migrating to Next.js would:

1. **Risk breaking 2200 tests** — path aliases, build config, SSR hydration mismatches
2. **Add zero SSR value** — a canvas editor does not benefit from server rendering
3. **Bloat the bundle** — Next.js adds ~80KB baseline for features StitchX does not need

The Turborepo approach gives the best of both worlds: Next.js for SEO-critical pages (hub, pricing, terms) and Vite for performance-critical SPAs (editor, text).

| Concern | Next.js monolith | Turborepo multi-app |
|---------|-----------------|---------------------|
| SSR for marketing | Yes | Yes (hub only) |
| Vite HMR for editor | No (webpack/turbopack) | Yes |
| Independent deploys | No (all-or-nothing) | Yes (per-app) |
| Test suite risk | High (2200 tests) | Zero (no migration) |
| Bundle size | +80KB baseline per route | Vite tree-shakes per app |
| Shared packages | Internal imports | `@stitch/*` workspace packages |

---

## Deployment Topology

### Vercel Project Configuration

| Vercel Project | Root Directory | Framework | Build Command |
|----------------|---------------|-----------|---------------|
| `stitchx-hub` | `apps/web` | Next.js | `cd ../.. && pnpm turbo run build --filter=web` |
| `stitchx-editor` | `apps/editor` | Vite | `cd ../.. && pnpm turbo run build --filter=editor` |
| `stitchx-text` | `apps/text` | Vite | `cd ../.. && pnpm turbo run build --filter=text` |

### Domain Mapping

| Domain | Vercel Project | Type |
|--------|---------------|------|
| `stitchx.com` | `stitchx-hub` | Production (custom domain) |
| `stitchx-editor.vercel.app` | `stitchx-editor` | Internal (rewrite target) |
| `stitchx-text.vercel.app` | `stitchx-text` | Internal (rewrite target) |

> Users only see `stitchx.com/*`. The `.vercel.app` subdomains are internal rewrite targets
> and should not be linked publicly.

---

## Root `package.json`

```json
{
  "private": true,
  "name": "stitchx-platform",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  },
  "packageManager": "pnpm@10.0.0"
}
```

---

## Summary of R1 Fixes Applied

| Issue | Original | Fix |
|-------|----------|-----|
| Python route location | `app/api/rasterize/route.py` | `api/rasterize.py` (root-level Vercel Functions) |
| Dev rewrites | Hardcoded production URLs | `isDev` conditional for localhost |
| Rewrite type | Default (afterFiles) | `beforeFiles` (edge-resolved, no serverless cold start) |
| Workspace packages | `['apps/*', 'packages/*']` | + `'services/*'` |
| Path alias | `@/` | `~/` (avoids collision with `@stitch/` scope) |
| Vite HMR | Not addressed | `optimizeDeps.exclude` + `server.watch.ignored` |
| TypeScript | Single tsconfig | Project references for faster type-checking |
| peerDeps | Not addressed | `.npmrc` with `public-hoist-pattern` for React |
| turbo.json | Missing `inputs`/`env` | Precise `inputs`, `outputs`, `env` per task |
