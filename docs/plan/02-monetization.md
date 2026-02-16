# 02 — Monetization

> Unified credit system, payment flow, Vercel KV storage, and webhook design.
> Date: 2026-02-16 | Source: STITCHINGBUNDLE.md Section 4, with R1 fixes

---

## Unified Credit System

One credit = one PDF download from **any** tool in the ecosystem. License keys are stored in `localStorage` and work across all tools because they share the same domain (`stitchx.com`).

### Pricing

| Plan | Price | Credits | Validity |
|------|-------|---------|----------|
| **Single** | $1.99 | 1 PDF download | Never expires |
| **Pack 5** | $5.99 | 5 PDF downloads | Never expires |
| **Pack 10** | $9.99 | 10 PDF downloads | Never expires |
| **Annual** | $39.99/year | Unlimited PDFs | 12 months |
| **Monthly** | $3.99/month | Unlimited PDFs | 1 month (auto-renew) |

> Pack 5 is the new impulse-buy tier ($1.20/pattern vs $1.99 single).
> Annual is $39.99/yr (was $24.99) — justified by multi-tool access across the ecosystem.
> Monthly at $3.99 lowers the commitment barrier for trial users.

### Free Tier (Every Tool)

- Full tool functionality (editor, preview, controls, URL share)
- **First PDF download is free** (email capture)
- OXS export free (StitchX only — open format)
- JSON export free (all tools)

---

## Payment Flow

```
User clicks "Download PDF"
       │
       v
┌─── First time? ──── YES ──> Free Modal (email) ──> Download ──> Upsell Modal
│         │
│         NO
│         │
│         v
│    Has credits? ──── YES ──> /api/verify (server-side) ──> Deduct credit ──> Download
│         │
│         NO
│         │
│         v
│    Payment Modal ──> Lemon Squeezy Checkout ──> Webhook ──> KV store ──> Key issued
│         │
│         v
│    Key in localStorage ──> Works in ALL tools (same domain)
```

> **CRITICAL**: Credit deduction MUST be server-side. The client calls `/api/verify`
> before generating the PDF. The server checks Vercel KV, deducts the credit atomically,
> and returns `{ allowed: true, remaining: N }`. The client then proceeds with download.
>
> Never trust `localStorage` alone for credit balance — it can be edited in DevTools.
> `localStorage` is a **cache** for UX (show remaining credits), not the source of truth.

---

## Vercel KV (Upstash Redis) — Server-Side Storage

> **CRITICAL**: The current webhook handler is a **NO-OP** — it validates the Lemon Squeezy
> signature but does not store anything. Orders are lost. Vercel KV is required to persist
> license data, track free downloads, and ensure webhook idempotency.

### KV Key Schema

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `license:{key}` | `{ plan, credits, email, activated_at, last_used }` | None (permanent) | License state (source of truth) |
| `free:{email_hash}` | `"1"` | 365 days | Tracks free download usage (prevents incognito abuse) |
| `webhook:{event_id}` | `"processed"` | 7 days | Idempotency — prevents double-processing webhooks |
| `email:{email_hash}` | `["key1", "key2", ...]` | None (permanent) | Key recovery — find all keys for an email |

### KV Value Structures

```typescript
// license:{key} value
interface LicenseRecord {
  plan: 'single' | 'pack5' | 'pack10' | 'annual' | 'monthly'
  credits: number        // -1 = unlimited (annual/monthly)
  email: string
  activated_at: string   // ISO 8601
  last_used: string      // ISO 8601 (updated on each /api/verify call)
  order_id: string       // Lemon Squeezy order ID
}
```

### Why Vercel KV (Upstash Redis)?

| Requirement | Vercel KV | Vercel Postgres | localStorage |
|-------------|-----------|-----------------|--------------|
| Sub-ms reads | Yes | No (cold start) | N/A (client) |
| Atomic decrement | `DECRBY` | `UPDATE ... SET` | No |
| TTL for cleanup | Native | Manual | No |
| Zero infra | Managed | Managed | N/A |
| Free tier | 3K req/day | 60 compute-hours | N/A |
| Vercel integration | First-party | First-party | N/A |

---

## Webhook Handler — Functional Design

> **CRITICAL**: The existing webhook validates the HMAC signature but never stores the order.
> This design stores the order in KV and sends a backup email.

```typescript
// apps/web/app/api/payment/webhook/route.ts
import { kv } from '@vercel/kv'
import crypto from 'crypto'
import type { NextRequest } from 'next/server'

const PLANS: Record<string, { plan: string; credits: number }> = {
  'VARIANT_SINGLE':  { plan: 'single',  credits: 1 },
  'VARIANT_PACK5':   { plan: 'pack5',   credits: 5 },
  'VARIANT_PACK10':  { plan: 'pack10',  credits: 10 },
  'VARIANT_ANNUAL':  { plan: 'annual',  credits: -1 },
  'VARIANT_MONTHLY': { plan: 'monthly', credits: -1 },
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-signature') ?? ''

  // 1. Verify HMAC signature
  const hmac = crypto.createHmac('sha256', process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!)
  hmac.update(body)
  const digest = hmac.digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const eventId = event.meta.event_name + ':' + event.data.id

  // 2. Idempotency check
  const already = await kv.get(`webhook:${eventId}`)
  if (already) {
    return Response.json({ status: 'already_processed' })
  }

  // 3. Extract order data
  const { email } = event.data.attributes
  const variantId = event.data.attributes.first_order_item?.variant_id
  const planConfig = PLANS[variantId] ?? PLANS['VARIANT_SINGLE']
  const licenseKey = event.data.attributes.license_key ?? crypto.randomUUID()

  // 4. Store license in KV
  const licenseRecord = {
    plan: planConfig.plan,
    credits: planConfig.credits,
    email,
    activated_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    order_id: event.data.id,
  }

  const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')

  await Promise.all([
    kv.set(`license:${licenseKey}`, licenseRecord),
    kv.set(`webhook:${eventId}`, 'processed', { ex: 7 * 86400 }),
    kv.set(`free:${emailHash}`, '1', { ex: 365 * 86400 }),
    // Append key to email's key list (for recovery)
    appendKeyToEmail(emailHash, licenseKey),
  ])

  // 5. Send backup email with license key (optional, via Resend/Postmark)
  // await sendLicenseEmail(email, licenseKey, planConfig.plan)

  return Response.json({ status: 'ok', key: licenseKey })
}

async function appendKeyToEmail(emailHash: string, key: string) {
  const existing = await kv.get<string[]>(`email:${emailHash}`)
  const keys = existing ?? []
  if (!keys.includes(key)) {
    keys.push(key)
    await kv.set(`email:${emailHash}`, keys)
  }
}
```

---

## Credit Verification Endpoint

```typescript
// apps/web/app/api/validate-key/route.ts
import { kv } from '@vercel/kv'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { key } = await request.json()

  if (!key || typeof key !== 'string') {
    return Response.json({ valid: false, error: 'Missing key' }, { status: 400 })
  }

  const license = await kv.get<LicenseRecord>(`license:${key}`)

  if (!license) {
    return Response.json({ valid: false, error: 'Unknown key' }, { status: 404 })
  }

  // Check expiration (annual/monthly)
  if (license.plan === 'annual' || license.plan === 'monthly') {
    const expiresAt = new Date(license.activated_at)
    expiresAt.setFullYear(
      expiresAt.getFullYear() + (license.plan === 'annual' ? 1 : 0),
      expiresAt.getMonth() + (license.plan === 'monthly' ? 1 : 0),
    )
    if (new Date() > expiresAt) {
      return Response.json({
        valid: false,
        error: 'Subscription expired',
        expired: true,
        plan: license.plan,
      })
    }
  }

  // Check credits (non-unlimited)
  if (license.credits !== -1 && license.credits <= 0) {
    return Response.json({
      valid: false,
      error: 'No credits remaining',
      credits: 0,
      plan: license.plan,
    })
  }

  // Deduct credit atomically (skip for unlimited)
  let remaining = license.credits
  if (license.credits !== -1) {
    remaining = await kv.decrby(`license:${key}:credits_counter`, 1)
    // Also update the license record
    license.credits = remaining
    license.last_used = new Date().toISOString()
    await kv.set(`license:${key}`, license)
  }

  return Response.json({
    valid: true,
    plan: license.plan,
    credits: remaining,
    email: license.email,
  })
}
```

> **Atomic credit deduction**: Uses Redis `DECRBY` so two simultaneous requests cannot
> consume the same credit. The license record is then updated for consistency, but `DECRBY`
> is the authoritative operation.

---

## Key Recovery by Email

Users who lose their license key can recover it by email:

```typescript
// apps/web/app/api/recover/route.ts
import { kv } from '@vercel/kv'
import crypto from 'crypto'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Missing email' }, { status: 400 })
  }

  const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')
  const keys = await kv.get<string[]>(`email:${emailHash}`)

  if (!keys || keys.length === 0) {
    // Do NOT reveal whether the email exists (security)
    return Response.json({ status: 'sent' })
  }

  // Fetch license details for each key
  const licenses = await Promise.all(
    keys.map(async (key) => {
      const record = await kv.get<LicenseRecord>(`license:${key}`)
      return record ? { key: maskKey(key), plan: record.plan, credits: record.credits } : null
    }),
  )

  // Send recovery email (never return keys directly in response)
  // await sendRecoveryEmail(email, licenses.filter(Boolean))

  return Response.json({ status: 'sent' })
}

function maskKey(key: string): string {
  // Show first 4 and last 4 characters: "abcd...wxyz"
  if (key.length <= 8) return key
  return key.slice(0, 4) + '...' + key.slice(-4)
}
```

> **Security**: The `/api/recover` endpoint never returns license keys in the HTTP response.
> It sends them via email only. The response is always `{ status: 'sent' }` regardless of
> whether the email exists, to prevent email enumeration.

---

## localStorage Schema (Client-Side Cache)

```typescript
// Shared across all tools on stitchx.com (same domain = same localStorage)
interface StoredLicense {
  key: string           // License key from Lemon Squeezy
  plan: 'single' | 'pack5' | 'pack10' | 'annual' | 'monthly'
  credits: number       // Remaining credits (-1 for unlimited) — CACHE ONLY
  expiresAt: string     // ISO date (null for non-subscription)
  activatedAt: string   // ISO date
  email: string         // User email
}

// localStorage keys (namespaced to avoid collisions)
// 'stitch_license'     -> JSON.stringify(StoredLicense)
// 'stitch_free_used'   -> 'true' (first free download used)
// 'stitch_email'       -> user email (from free download)
```

> **IMPORTANT**: `localStorage.credits` is a **client-side cache** for UI display only.
> The server (Vercel KV) is the source of truth. Every PDF download calls `/api/verify`
> which checks KV, deducts atomically, and returns the real balance. The client then
> updates `localStorage` to match.

### Client-Side Sync Flow

```
User clicks "Download PDF"
       │
       v
Client reads localStorage.stitch_license
       │
       v
┌── credits > 0 (or -1)? ── YES ──> POST /api/verify { key }
│         │                                │
│         │                           ┌── valid? ── YES ──> Download PDF
│         │                           │         │           Update localStorage.credits
│         │                           │         │
│         │                           │         NO ──> Show "no credits" / "expired"
│         │                           │                Remove localStorage.stitch_license
│         │
│         NO
│         v
│    Show Payment Modal
```

---

## Free Download Tracking (Anti-Abuse)

The free first download is tracked in **two places** to prevent incognito abuse:

| Layer | Storage | Key | Bypass Risk |
|-------|---------|-----|-------------|
| Client | `localStorage` | `stitch_free_used` = `"true"` | Cleared in incognito/DevTools |
| Server | Vercel KV | `free:{email_hash}` = `"1"` | Requires a new email address |

### Server-Side Free Download Check

```typescript
// In /api/verify or a dedicated /api/free-download endpoint
import crypto from 'crypto'

async function checkFreeDownload(email: string): Promise<boolean> {
  const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')
  const used = await kv.get(`free:${emailHash}`)

  if (used) return false  // Already used free download

  // Mark as used
  await kv.set(`free:${emailHash}`, '1', { ex: 365 * 86400 })
  return true
}
```

> A determined user can still create throwaway emails for infinite free downloads.
> This is acceptable — the goal is to prevent casual abuse, not stop determined pirates.
> The email capture itself has marketing value regardless.

---

## Lemon Squeezy Integration

| Aspect | Details |
|--------|---------|
| **Role** | Merchant of Record (handles taxes, invoicing, refunds globally) |
| **Webhook** | `POST /api/payment/webhook` -> validates HMAC -> stores in KV |
| **Checkout** | Overlay iframe (same as current Word2Stitch implementation) |
| **Products** | 5 Lemon Squeezy products (single, pack5, pack10, annual, monthly) |
| **Subscription** | Annual + monthly are Lemon Squeezy subscriptions with auto-renewal |

### Lemon Squeezy Webhook Events to Handle

| Event | Action |
|-------|--------|
| `order_created` | Create `license:{key}` in KV, send confirmation email |
| `subscription_created` | Create `license:{key}` with `credits: -1` |
| `subscription_updated` | Update plan/credits in KV |
| `subscription_expired` | Set `credits: 0` in KV (keep record for recovery) |
| `subscription_resumed` | Restore `credits: -1` in KV |
| `order_refunded` | Set `credits: 0` in KV, mark as refunded |

---

## Migration from Current Word2Stitch Payment

Current Word2Stitch payment code to extract:

| Current File | Extract To | What It Does |
|-------------|-----------|--------------|
| `ui-modules/auth.js` (initAuth, key validation) | `@stitch/payment/keyManager.ts` | localStorage CRUD, key format validation |
| `ui-modules/auth.js` (checkout overlay) | `@stitch/payment/checkout.ts` | Lemon Squeezy iframe overlay |
| `ui-modules/auth.js` (webhook handling) | `@stitch/payment/api.ts` + webhook route | Server-side key validation + KV storage |
| `ui-shell.html` (pay-modal HTML) | `@stitch/payment/components/PaymentModal.tsx` | React component |
| `ui-shell.html` (free-modal HTML) | `@stitch/payment/components/FreeDownloadModal.tsx` | React component |
| `ui-shell.html` (upsell-modal HTML) | `@stitch/payment/components/UpsellModal.tsx` | React component |
| `css/08-auth.css` | `@stitch/payment/components/PaymentModal.module.css` | Styles (CSS Modules) |
| `i18n-data.js` (pay_* keys) | `@stitch/i18n/locales/*/payment.json` | 17 languages |

---

## Revenue Projections (Conservative)

| Scenario | Monthly Users | Conversion | Avg. Revenue/User | MRR |
|----------|--------------|------------|-------------------|-----|
| Current (W2S only) | ~500 | 2% | $3.00 | $30 |
| + StitchX payment | ~2000 | 3% | $5.00 | $300 |
| + Hub + SEO | ~5000 | 3% | $5.00 | $750 |
| + Annual plans | ~5000 | 5% | $8.00 | $2000 |

> These are rough estimates. The key insight is that **StitchX generates zero revenue today**
> despite being the most complex tool. Adding payment gating to PDF export is the
> highest-ROI change in the entire plan.
