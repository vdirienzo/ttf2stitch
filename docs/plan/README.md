# StitchX Platform — Embroidery Tools Ecosystem

> **Status**: Draft v2 (Round 1 reviewed) | **Date**: 2026-02-16

A single-domain platform (`stitchx.com`) grouping specialized cross-stitch tools with unified payment.

```
stitchx.com/             → Hub landing (Next.js 15 — SSR, SEO)
stitchx.com/editor       → Pattern Editor (StitchX — Vite + React 19)
stitchx.com/text         → Text to Pattern (Word2Stitch — Vite + React 19)
stitchx.com/convert      → Future: Image to Pattern
stitchx.com/fonts        → Future: Font Browser
stitchx.com/palette      → Future: DMC Palette Builder
```

## Plan Documents

| # | Document | Content |
|---|----------|---------|
| 0 | [Current State](./00-current-state.md) | Inventory of StitchX + Word2Stitch |
| 1 | [Architecture](./01-architecture.md) | Turborepo, Vercel multi-zone, deployment |
| 2 | [Monetization](./02-monetization.md) | Credits, pricing, Vercel KV, webhook |
| 3 | [Phase 1: Monorepo](./03-phase1-monorepo.md) | Foundation setup, PWA gotchas |
| 4 | [Phase 2: Payment](./04-phase2-payment.md) | @stitch/payment package, migration |
| 5 | [Phase 3: StitchX $](./05-phase3-stitchx.md) | Payment integration, server-side gating |
| 6 | [Phase 4: Hub](./06-phase4-hub.md) | Landing, rewrites, PPR, SEO |
| 7 | [Phase 5: W2S Rewrite](./07-phase5-w2s.md) | React rewrite, Python API, Zustand |
| 8 | [Phase 6: Cross-Tool](./08-phase6-cross.md) | Open in Editor, shared fonts |
| 9 | [Phase 7: Growth](./09-phase7-growth.md) | Image-to-Pattern, Gallery, Palette |
| 10 | [Best Practices](./10-best-practices.md) | Vercel React rules, React Compiler |
| 11 | [Performance](./11-performance.md) | CWV targets, caching, budgets |
| 12 | [Analytics](./12-analytics.md) | Conversion tracking, 14 events |
| 13 | [Migration](./13-migration.md) | Existing W2S user migration |
| 14 | [Risk Matrix](./14-risk-matrix.md) | Risks + mitigations |
| 15 | [Decisions](./15-decisions.md) | Architecture decision log |
| 16 | [Tech Stack](./16-tech-stack.md) | Stack summary + versions |

## Priority Matrix

```
                HIGH IMPACT
                     │
    Phase 3 ★★★★     │     Phase 4 ★★★
    (StitchX $$$)    │     (Hub + Domain)
                     │
   ──────────────────┼──────────────────
                     │
    Phase 2 ★★       │     Phase 5 ★★
    (Payment pkg)    │     (W2S rewrite)
                     │
                LOW IMPACT
    LOW EFFORT               HIGH EFFORT
```

**Execution order**: Phase 1 → 2 → 3 → 4 → 5 → 6 → 7

## Quick Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Hub | Next.js 15 (App Router, PPR, Server Actions) |
| Apps | Vite 7 + React 19 + React Compiler |
| State | Zustand 5 |
| Payment | Lemon Squeezy + Vercel KV (Upstash) |
| i18n | i18next (17 languages) |
| PDF | jsPDF 4 |
| Rasterization | Vercel Python Functions |
| CI/CD | GitHub Actions → Vercel |
