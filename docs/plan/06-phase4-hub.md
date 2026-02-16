# Phase 4 — Hub Landing + Unified Domain

> **Goal**: Create the marketing landing page and compose all tools under `stitchx.com`.

**Depends on**: Phase 3 (StitchX payment integration)
**Unlocks**: Phase 5 (Word2Stitch rewrite), Phase 6 (cross-tool features)

---

## 4.1 Landing Page Wireframe

```
┌─────────────────────────────────────────────────────┐
│  X StitchX                              [Pricing]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│     Cross-Stitch Tools for Every Project            │
│     Create, design, and share beautiful             │
│     cross-stitch patterns with ease.                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │  Pattern      │  │  Text to     │                │
│  │  Editor       │  │  Pattern     │                │
│  │              │  │              │                │
│  │ Full canvas  │  │ Type text,   │                │
│  │ editor with  │  │ pick a font, │                │
│  │ 19 tools     │  │ get pattern  │                │
│  │              │  │              │                │
│  │ [Open ->]    │  │ [Try it ->]  │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │  Image to    │  │  Font        │                │
│  │  Pattern     │  │  Browser     │                │
│  │  Coming soon │  │  Coming soon │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  ─────────────────────────────────────              │
│  One key, every tool. $1.99 per pattern.            │
│  ─────────────────────────────────────              │
└─────────────────────────────────────────────────────┘
```

---

## 4.2 Next.js App Router Structure

### Root Layout (Server Component)

```tsx
// apps/web/app/layout.tsx
import { SharedHeader, SharedFooter } from '@stitch/ui'
import '@stitch/theme/global.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'StitchX — Cross-Stitch Tools',
    template: '%s | StitchX',
  },
  description: 'Create, design, and share cross-stitch patterns with professional tools.',
  metadataBase: new URL('https://stitchx.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://stitchx.com',
    siteName: 'StitchX',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StitchX — Cross-Stitch Tools',
    description: 'Create, design, and share cross-stitch patterns.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SharedHeader currentTool="hub" />
        {children}
        <SharedFooter />
      </body>
    </html>
  )
}
```

### Landing Page with Partial Prerendering (PPR)

PPR allows the static shell (hero, tool cards) to be served instantly from the edge while dynamic parts (pricing, user state) stream in.

```tsx
// apps/web/app/page.tsx
import { Suspense } from 'react'
import { ToolCards, ToolCardsSkeleton } from '@/components/ToolCards'
import { PricingTeaser, PricingTeaserSkeleton } from '@/components/PricingTeaser'

export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>Cross-Stitch Tools for Every Project</h1>
        <p>Create, design, and share beautiful cross-stitch patterns.</p>
      </section>

      {/* PPR: static shell renders instantly, dynamic content streams */}
      <Suspense fallback={<ToolCardsSkeleton />}>
        <ToolCards />
      </Suspense>

      <Suspense fallback={<PricingTeaserSkeleton />}>
        <PricingTeaser />
      </Suspense>

      <section className="cta">
        <p>One key, every tool. Starting at $1.99 per pattern.</p>
        <a href="/pricing">View pricing</a>
      </section>
    </main>
  )
}
```

### Enable PPR in Next.js Config

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
  experimental: {
    ppr: 'incremental',  // Enable Partial Prerendering per-route
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

**How PPR works here**: The landing page HTML shell (hero section, static card outlines) is prerendered at build time and served from the CDN edge. The `<Suspense>` boundaries mark dynamic holes that stream in via RSC payload on request. Users see content in <50ms with no layout shift.

---

## 4.3 Vercel Multi-Project Configuration

Three Vercel projects deployed from one monorepo, composed under one domain:

```
┌─────────────────────────────────────────────────────────────┐
│  stitchx.com (Vercel Project: "stitchx-hub")                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js App Router (apps/web/)                      │   │
│  │  /           -> Landing page (RSC + PPR)             │   │
│  │  /pricing    -> Pricing page (RSC)                   │   │
│  │  /terms      -> Terms of service (RSC)               │   │
│  │  /api/*      -> Payment API, rasterize API           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Rewrites:                                                  │
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

### Hub (`apps/web/vercel.json`)

```json
{
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=web",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

### Editor (`apps/editor/vercel.json`)

```json
{
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=editor",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### Text (`apps/text/vercel.json`)

```json
{
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=text",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### Linking Projects to Monorepo

Each Vercel project points to the same GitHub repo but different root directories:

| Vercel Project | Root Directory | Framework | Domain |
|----------------|---------------|-----------|--------|
| `stitchx-hub` | `apps/web` | Next.js | `stitchx.com` (production) |
| `stitchx-editor` | `apps/editor` | Vite | `stitchx-editor.vercel.app` (internal) |
| `stitchx-text` | `apps/text` | Vite | `stitchx-text.vercel.app` (internal) |

The editor and text projects are not accessed directly by users -- all traffic flows through the hub's rewrites for a unified domain experience.

---

## 4.4 SEO Optimization

### Structured Data (JSON-LD)

```tsx
// apps/web/app/page.tsx (add to landing page)
export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'StitchX',
    url: 'https://stitchx.com',
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    description: 'Professional cross-stitch pattern tools: editor, text-to-pattern, image converter.',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '1.99',
      highPrice: '39.99',
      priceCurrency: 'USD',
      offerCount: 5,
    },
    featureList: [
      'Cross-stitch pattern editor with 19 tools',
      'Text to cross-stitch pattern converter',
      'PDF export with DMC thread legend',
      '500+ DMC colors',
      '70+ bitmap fonts',
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>{/* ... page content */}</main>
    </>
  )
}
```

### Auto-Generated Sitemap

```typescript
// apps/web/app/sitemap.ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://stitchx.com'

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/editor`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/text`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
```

### Robots

```typescript
// apps/web/app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://stitchx.com/sitemap.xml',
  }
}
```

### Per-Route Metadata

```tsx
// apps/web/app/pricing/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'StitchX pricing: $1.99 single pattern, $9.99 for 10, or $39.99/year unlimited.',
  openGraph: {
    title: 'StitchX Pricing — PDF Export Plans',
    description: 'One key works across all StitchX tools.',
  },
}
```

---

## 4.5 Verification Checklist

### Deployment

- [ ] Hub landing page loads at `stitchx.com/`
- [ ] Editor loads at `stitchx.com/editor` via rewrite
- [ ] Text tool loads at `stitchx.com/text` via rewrite
- [ ] Rewrites proxy correctly (no CORS errors, no double-load)
- [ ] Assets (JS, CSS, images) load correctly through rewrites
- [ ] API routes work: `/api/payment/webhook`, `/api/validate-key`, `/api/rasterize`

### PPR and Performance

- [ ] PPR enabled: static shell serves from edge in <50ms
- [ ] Suspense boundaries stream correctly (no flash of fallback)
- [ ] Lighthouse Performance score >90 on landing page
- [ ] No client-side JavaScript shipped for landing page (pure RSC)
- [ ] Core Web Vitals: LCP <2.5s, CLS <0.1, INP <200ms

### SEO

- [ ] Meta tags render correctly (title, description, OG, Twitter)
- [ ] JSON-LD structured data validates (Google Rich Results Test)
- [ ] `sitemap.xml` accessible and lists all public routes
- [ ] `robots.txt` blocks `/api/` only
- [ ] Canonical URLs set correctly for each page

### Shared State

- [ ] `localStorage` is shared across `/`, `/editor`, `/text` (same domain)
- [ ] SharedHeader shows current tool indicator (highlights active nav item)
- [ ] SharedFooter renders consistently across all routes
- [ ] Payment modal accessible from any tool
- [ ] Language selection persists across tool navigation

### Responsive Design

- [ ] Mobile layout: stacked tool cards, hamburger nav
- [ ] Tablet layout: 2-column tool cards
- [ ] Desktop layout: full wireframe layout
- [ ] Touch targets meet 44x44px minimum
