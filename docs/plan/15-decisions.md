# 15. Decision Log

> Architecture decisions for the StitchX platform. Each decision includes rationale and alternatives considered.

---

## 15.1 Decision Table

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| D1 | **Turborepo + pnpm** monorepo | Industry standard for Vercel projects. Shared packages (`@stitch/*`), independent builds, remote caching. pnpm strict hoisting prevents phantom dependencies. | Nx (heavier runtime, steeper learning curve), separate repos (no code sharing, duplicated CI) |
| D2 | **Keep StitchX on Vite** (not Next.js) | Canvas SPA has zero SSR benefit. 2200 tests tied to Vite/Vitest toolchain. Migration would risk months of regressions for no user-facing improvement. | Next.js (risky migration, SSR adds latency for canvas-only app), Remix (same SSR concern) |
| D3 | **Next.js 15 for hub only** | SEO-critical pages (landing, pricing, terms, blog) need SSR + RSC. Zero client JS for marketing pages. App Router provides layouts, streaming, metadata API. | Astro (less React integration, can't share components), Vite SSR (manual setup, no streaming) |
| D4 | **Vercel rewrites** for single domain | Simpler than reverse proxy. Native Vercel support. Same-origin means shared cookies/localStorage across all tools. No CORS issues. | Subdomains (separate localStorage per subdomain), nginx reverse proxy (infra overhead, not serverless) |
| D5 | **Lemon Squeezy** (keep existing) | Already integrated in W2S with 3 products. Merchant of Record handles global taxes, invoicing, refunds. No migration needed. | Stripe (more setup, tax compliance burden, not MoR), Paddle (similar to LS but would require full migration) |
| D6 | **localStorage for license keys** | Simplest persistence. No backend auth needed. Works offline (PWA). Same domain = shared across all tools. Supplemented by Vercel KV for server-side verification. | Server-side sessions (requires auth system), IndexedDB (overkill for key-value), cookies (size limits) |
| D7 | **React rewrite for Word2Stitch** | Enables `@stitch/payment` and `@stitch/ui` integration. TypeScript safety. Component testing with Vitest + Testing Library. Current vanilla JS cannot share code with React ecosystem. | Keep vanilla JS (can't share components, no TypeScript), Svelte (different ecosystem, can't reuse @stitch/* packages) |
| D8 | **Python serverless for rasterization** | fontTools + PIL are Python-only libraries with no JS equivalent. Vercel Python functions deploy from same monorepo. Cache-Control headers minimize cold starts. | WASM (fontTools doesn't compile to WASM), Node.js sharp (limited font parsing, no glyph extraction), external service (adds latency + cost) |
| D9 | **Zustand for state** in all apps | Already proven in StitchX (7 slices, undo/redo). Lightweight (~1KB). Excellent TypeScript support. Selector-based re-renders prevent performance issues. | Redux Toolkit (heavier, more boilerplate), Jotai (atomic model less intuitive for app state), React Context (re-renders entire tree) |
| D10 | **i18next for i18n** across all apps | Already in StitchX with 17 languages. Mature ecosystem. Lazy-loading namespaces. React integration via `react-i18next`. Extractable to `@stitch/i18n` shared package. | next-intl (Next.js only, can't use in Vite apps), FormatJS (heavier), custom solution (maintenance burden) |
| **D11** | **React Compiler over manual memo** | React Compiler (babel plugin) auto-memoizes components and hooks at build time. Eliminates manual `React.memo()`, `useMemo()`, `useCallback()` in most cases. Less code, fewer bugs from stale closures, automatic optimization. | Manual `React.memo` + `useMemo` + `useCallback` (error-prone, verbose, developers forget to add/update deps arrays) |
| **D12** | **Vercel KV (Upstash Redis)** for credit caching | Server-side credit storage prevents localStorage tampering. Abuse prevention via email-hash deduplication for free downloads. Resilience: credits survive browser clear/device switch. Free tier: 256MB, 30K requests/day — sufficient for early traffic. $0/month. | Vercel Postgres (overkill for key-value, higher latency), Planetscale (requires schema, more setup), client-only localStorage (no abuse prevention, no server verification) |
| **D13** | **Path alias `~/` instead of `@/`** | Avoids collision with `@stitch/` npm scope. `@/components` vs `@stitch/ui` is ambiguous. `~/components` is unambiguous and used by Nuxt/Remix conventions. Configured via `tsconfig.json` paths + Vite `resolve.alias`. | `@/` (collides with @stitch/ scope, confusing imports), `#/` (non-standard), no alias (long relative paths `../../../`) |
| **D14** | **Partial Prerendering (PPR)** for hub landing | Instant static shell (header, hero, footer) served from CDN edge. Dynamic content (tool cards with live stats, pricing) streamed in via Suspense boundaries. Best of static + dynamic: TTFB of static site, freshness of SSR. | Full SSR (slower TTFB, entire page waits for data), Full SSG (stale data, rebuild on every change), ISR (stale-while-revalidate but still full-page) |
| **D15** | **Server Actions for mutations** | Key validation, checkout initiation, credit deduction, email collection — all are mutations that benefit from Server Actions. More ergonomic than API routes: no manual fetch, automatic serialization, progressive enhancement (works without JS). TypeScript end-to-end. | API Routes (more boilerplate, manual fetch/error handling), tRPC (additional dependency, complex setup for simple mutations), REST API (separate server, CORS concerns) |
| **D16** | **`beforeFiles` rewrites** | Vercel `beforeFiles` rewrites resolve at the edge layer before any filesystem or serverless lookup. This means `/editor/*` and `/text/*` rewrites happen with zero serverless function invocation on the hub. Lower latency, no cold start for rewrite resolution. | Standard rewrites (may hit serverless first), `afterFiles` (filesystem check first, then rewrite — unnecessary overhead), middleware (runs on every request, overkill for static rewrites) |

---

## 15.2 Decision Details

### D11: React Compiler

```jsonc
// babel.config.js (shared across all apps)
{
  "plugins": [
    ["babel-plugin-react-compiler", {
      // Opt-in: only compile files with 'use memo' directive
      // or opt-out: compile everything, skip with 'use no memo'
    }]
  ]
}
```

**What it replaces**:
- `React.memo()` on 80%+ of components
- `useMemo()` for derived computations
- `useCallback()` for event handlers passed as props

**What it does NOT replace** (still manual):
- `useRef` for DOM references
- `useMemo` for expensive computations with external deps
- StitchX canvas rendering (imperative, not declarative React)

### D12: Vercel KV Usage

```typescript
// Credit storage in Vercel KV
import { kv } from '@vercel/kv'

// On webhook: store credits
await kv.hset(`license:${key}`, {
  plan: 'pack10',
  credits: 10,
  email: 'user@example.com',
  activatedAt: new Date().toISOString(),
})

// On deduction: atomic decrement
const credits = await kv.hincrby(`license:${key}`, 'credits', -1)
if (credits < 0) {
  await kv.hincrby(`license:${key}`, 'credits', 1) // rollback
  return { error: 'no_credits' }
}

// Free download abuse check
const emailHash = sha256(email)
const used = await kv.get(`free:${emailHash}`)
if (used) return { error: 'free_already_used' }
await kv.set(`free:${emailHash}`, true, { ex: 365 * 86400 }) // 1 year TTL
```

**Free tier limits** (Upstash):
| Resource | Limit | Expected Usage |
|----------|-------|----------------|
| Storage | 256 MB | ~50K license records |
| Daily requests | 30,000 | ~500 purchases + validations/day |
| Max request size | 1 MB | License records are <1KB |

### D13: Path Alias Configuration

```jsonc
// tsconfig.json (shared via @stitch/config)
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

```typescript
// vite.config.ts
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
})
```

**Usage**:
```typescript
// Unambiguous imports
import { PatternCanvas } from '~/components/Preview/PatternCanvas'  // local
import { PaymentModal } from '@stitch/ui'                           // package
```

### D14: PPR Configuration

```typescript
// apps/web/app/page.tsx
import { Suspense } from 'react'
import { ToolCards } from './components/ToolCards'
import { HeroSection } from './components/HeroSection'

// Static shell (prerendered at build time)
export default function Home() {
  return (
    <main>
      <HeroSection />  {/* Static — instant from CDN */}

      <Suspense fallback={<ToolCardsSkeleton />}>
        <ToolCards />   {/* Dynamic — streamed in */}
      </Suspense>

      <PricingTeaser /> {/* Static — instant from CDN */}
    </main>
  )
}
```

```typescript
// next.config.ts
const config: NextConfig = {
  experimental: {
    ppr: 'incremental',  // Enable Partial Prerendering per-route
  },
}
```

### D15: Server Actions Example

```typescript
// apps/web/app/actions/payment.ts
'use server'

import { kv } from '@vercel/kv'

export async function validateKey(key: string) {
  const license = await kv.hgetall(`license:${key}`)
  if (!license) return { valid: false, error: 'invalid_key' }

  const expired = license.expiresAt && new Date(license.expiresAt) < new Date()
  if (expired) return { valid: false, error: 'expired' }

  return {
    valid: true,
    plan: license.plan,
    credits: license.credits,
    expiresAt: license.expiresAt,
  }
}

export async function deductCredit(key: string, idempotencyKey: string) {
  // Check idempotency
  const seen = await kv.get(`idem:${idempotencyKey}`)
  if (seen) return seen  // Return cached result

  const credits = await kv.hincrby(`license:${key}`, 'credits', -1)
  if (credits < 0) {
    await kv.hincrby(`license:${key}`, 'credits', 1)
    return { success: false, error: 'no_credits' }
  }

  const result = { success: true, credits }
  await kv.set(`idem:${idempotencyKey}`, result, { ex: 3600 }) // 1h TTL
  return result
}
```

### D16: beforeFiles Rewrites

```typescript
// apps/web/next.config.ts
const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        // Resolved at edge — zero serverless invocation
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
```

**Performance difference**:
| Rewrite Type | Resolution | Latency |
|-------------|------------|---------|
| `beforeFiles` | Edge CDN | ~5ms |
| Standard (default) | Serverless → filesystem → rewrite | ~50-200ms |
| `afterFiles` | Filesystem → miss → rewrite | ~30-100ms |
| Middleware | Edge function (JS execution) | ~10-30ms |
