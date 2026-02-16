# 14. Risk Matrix

> Comprehensive risk assessment for the StitchX platform migration and consolidation.

---

## 14.1 Risk Table

| # | Risk | Probability | Impact | Mitigation | Status |
|---|------|------------|--------|------------|--------|
| R1 | StitchX migration to monorepo breaks tests | Medium | High | Run full 2200-test suite before/after. Incremental migration: copy, verify, commit. | Existing |
| R2 | Python cold start on Vercel (2-4s) | High | High | CDN cache with `Cache-Control: public, max-age=3600`. Vercel cron pre-warm every 5 min. Fallback to Railway/Fly.io if latency unacceptable. | Mitigated |
| R3 | Vercel rewrites cause CORS/cookie issues | Low | High | Use `beforeFiles` rewrites (edge-resolved, no serverless hop). Same-origin means no CORS. Test with incognito + multiple browsers. | Mitigated |
| R4 | Word2Stitch React rewrite takes too long | Medium | Low | Keep current vanilla JS W2S running on old domain. Migrate users only when React version reaches feature parity. See [13-migration.md](./13-migration.md) for gradual rollout. | Existing |
| R5 | Lemon Squeezy webhook reliability | Low | High | Idempotent handlers (deduplicate by order ID in Vercel KV). Retry logic with exponential backoff. Client-side key validation as fallback. | Existing |
| R6 | localStorage key sharing across subpaths | Low | Low | All tools on same `stitchx.com` domain = same localStorage. Namespace keys with `stitch_` prefix. Test across `/editor`, `/text`, `/` paths. | Existing |
| R7 | Bundle size growth from shared packages | Medium | Medium | Dynamic imports for modals (`React.lazy`). Tree-shaking via named exports (no barrel re-exports). Monitor with `rollup-plugin-visualizer`. Budget: 150KB initial JS. | Mitigated |
| R8 | User confusion (one key = all tools) | Medium | Low | Clear messaging in payment modal: "Your key works on all StitchX tools". Unified pricing page at `/pricing`. Consistent UI via `@stitch/ui`. | Existing |
| R9 | **Webhook is a no-op** (current W2S) | **Critical** | **Critical** | Current W2S webhook handler validates signature but does nothing with the payload. Fixed in monetization plan: webhook writes license to Vercel KV, enables server-side credit verification. See [02-monetization.md](./02-monetization.md). | **New — Mitigated in plan** |
| R10 | **Free download abuse via incognito** | High | Medium | Incognito clears localStorage, allowing unlimited free downloads. Mitigated with email-hash deduplication in Vercel KV: `sha256(email)` stored on first free download, checked server-side before granting free credit. | **New — Mitigated** |
| R11 | **PWA breaks with `/editor/` base path** | Medium | High | StitchX PWA service worker scope defaults to `/`. With `base: '/editor/'`, scope must change to `/editor/`. Update `vite.config.ts` PWA plugin `scope` + `start_url`. Manifest `start_url` must be `/editor/`. Cache paths must be prefixed. | **New — Mitigated** |
| R12 | **Credit deduction is client-side only** | High | **Critical** | Current W2S deducts credits in localStorage without server verification. Malicious users can edit localStorage to restore credits. Mitigated with server-side verify: `POST /api/verify` checks Vercel KV balance, deducts atomically, returns new balance. Client syncs from server response. | **New — Mitigated** |
| R13 | **Python cold start 2-4s** (revised) | High | High | Original estimate was 1-3s; real-world Vercel Python is 2-4s with fontTools + Pillow imports. Mitigated with: (1) CDN `Cache-Control` for repeated queries, (2) Vercel cron job hits `/api/rasterize` every 5 min to keep warm, (3) client shows skeleton + progress indicator during load. | **New — Mitigated** |
| R14 | **React duplication across packages** | Medium | Medium | Multiple `apps/` each declaring `react` as dependency could bundle React multiple times. Mitigated with `peerDependencies` in all `@stitch/*` packages: React is a peer dep, only the apps install it. Turborepo resolves to single copy via pnpm hoisting. Verify with `rollup-plugin-visualizer`. | **New — Mitigated** |
| R15 | **Double-click race on credit deduction** | Medium | High | Fast double-click on "Download PDF" could deduct 2 credits. Mitigated with `useRef` guard in `usePaymentGate`: set `isProcessing.current = true` on first click, block subsequent clicks until download completes. Server-side: idempotency key per deduction request. | **New — Mitigated** |
| R16 | Existing user migration data loss | Low | High | localStorage keys on old domain cannot be read from new domain. Solved with URL fragment migration (see [13-migration.md](./13-migration.md)). Key recovery endpoint as fallback. 6-month parallel operation window. | **New — Mitigated** |
| R17 | Vercel Python function size limit | Low | Medium | Vercel serverless functions have a 50MB compressed limit. fontTools + Pillow + fonts could exceed this. Mitigate by bundling only rasterizer core (no CLI, no tests, no extractor). Use `requirements.txt` with pinned minimal deps. Pre-test deployed function size. | **New** |
| R18 | SEO traffic loss during domain migration | Medium | Medium | Old W2S has indexed pages on Google. 301 redirects preserve SEO juice. Submit new sitemap to Google Search Console. Monitor indexing via GSC for 3 months. Keep old domain redirecting for 6+ months. | **New — Mitigated** |
| R19 | COOP/COEP headers break Lemon Squeezy checkout iframe | Medium | High | Image-to-Pattern (`/convert`) requires `SharedArrayBuffer` for K-means++ Web Worker, which mandates `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. These headers block third-party iframes including Lemon Squeezy checkout. Mitigated with popup fallback: detect `crossOriginIsolated` at runtime and open checkout in `window.open()` instead of iframe overlay. See [09-phase7-growth.md](./09-phase7-growth.md). | **New — Mitigated** |

---

## 14.2 Risk Distribution

```
CRITICAL ██████░░░░  2 risks (R9, R12) — both mitigated in plan
HIGH     ██████████  5 risks (R2, R11, R13, R15, R19)
MEDIUM   ██████████  6 risks (R1, R4, R7, R14, R17, R18)
LOW      ████░░░░░░  6 risks (R3, R5, R6, R8, R16)
```

---

## 14.3 Mitigation Priority

Address risks in this order based on impact and probability:

| Priority | Risks | Action Required |
|----------|-------|----------------|
| **P0 — Before launch** | R9 (webhook no-op), R12 (client-side credits) | Implement server-side webhook + KV credit storage |
| **P0 — Before launch** | R15 (double-click race) | Add `useRef` guard + server idempotency |
| **P1 — Phase 1** | R11 (PWA base path) | Update service worker scope in vite.config.ts |
| **P1 — Phase 1** | R14 (React duplication) | Set peerDependencies in all @stitch/* packages |
| **P2 — Phase 2** | R10 (incognito abuse) | Implement email-hash in Vercel KV |
| **P2 — Phase 2** | R13 (cold start) | CDN cache + cron pre-warm |
| **P3 — Phase 4** | R16 (migration data loss), R18 (SEO loss) | URL fragment migration + 301 redirects |

---

## 14.4 Double-Click Race Guard (R15)

Implementation detail for the `useRef` guard pattern:

```typescript
// Inside usePaymentGate.ts
const isProcessing = useRef(false)

const gatedDownload = useCallback(async (downloadFn: () => Promise<void>) => {
  if (isProcessing.current) return  // Block double-click
  isProcessing.current = true

  try {
    if (hasCredits) {
      const success = await serverDeductCredit(idempotencyKey)
      if (success) await downloadFn()
    } else if (!freeDownloadUsed) {
      setPendingDownload(() => downloadFn)
      setShowFreeModal(true)
    } else {
      setPendingDownload(() => downloadFn)
      setShowPayModal(true)
    }
  } finally {
    isProcessing.current = false
  }
}, [hasCredits, freeDownloadUsed])
```

---

## 14.5 Server-Side Credit Verification (R12)

Replace client-only deduction with server-verified flow:

```
Client: POST /api/verify { key, idempotencyKey }
         │
         ▼
Server: Verify key in Vercel KV
         ├── Key not found → 401
         ├── Credits = 0 → 402 (payment required)
         ├── Idempotency key seen → return cached result
         └── Credits > 0 → atomic decrement → return { credits: N-1 }
         │
         ▼
Client: Sync localStorage from server response
         └── Proceed with PDF download
```
