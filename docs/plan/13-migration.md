# 13. Migration Path — Existing Word2Stitch Users

> Ensure zero disruption for existing paying customers during the transition from `word2stitch.vercel.app` to `stitchx.com/text`.

---

## 13.1 Overview

Word2Stitch has active paying users with license keys stored under `w2s_license_key` in localStorage on the `word2stitch.vercel.app` domain. The migration must:

1. Preserve all purchased credits/subscriptions
2. Redirect traffic seamlessly
3. Notify users proactively
4. Provide key recovery for edge cases
5. Run both domains in parallel during transition

---

## 13.2 localStorage Key Migration

### Old vs New Schema

| Aspect | Old (Word2Stitch) | New (StitchX) |
|--------|-------------------|---------------|
| **Domain** | `word2stitch.vercel.app` | `stitchx.com` |
| **License key** | `w2s_license_key` | `stitch_license` |
| **Free used flag** | `w2s_first_free` | `stitch_free_used` |
| **Email** | `w2s_email` | `stitch_email` |
| **Format** | Flat string (key only) | JSON `StoredLicense` object |

### Migration Function

The old W2S site injects a migration script that reads existing keys and passes them to the new domain via URL parameter on redirect:

```typescript
// Runs on word2stitch.vercel.app before redirect
function migrateToStitchX(): void {
  const oldKey = localStorage.getItem('w2s_license_key')
  const oldEmail = localStorage.getItem('w2s_email')
  const freeUsed = localStorage.getItem('w2s_first_free')

  if (!oldKey && !oldEmail) {
    // No data to migrate — redirect directly
    window.location.href = 'https://stitchx.com/text'
    return
  }

  // Encode migration payload in URL fragment (not sent to server)
  const payload = btoa(JSON.stringify({
    key: oldKey,
    email: oldEmail,
    freeUsed: freeUsed === '1',
    migratedAt: new Date().toISOString(),
  }))

  window.location.href = `https://stitchx.com/text#migrate=${payload}`
}
```

```typescript
// Runs on stitchx.com/text on first load
function receiveMigration(): void {
  const hash = window.location.hash
  if (!hash.startsWith('#migrate=')) return

  try {
    const payload = JSON.parse(atob(hash.slice('#migrate='.length)))

    if (payload.key) {
      // Validate key on server, then store in new format
      validateAndStore(payload.key, payload.email)
    }

    if (payload.freeUsed) {
      localStorage.setItem('stitch_free_used', 'true')
    }

    if (payload.email) {
      localStorage.setItem('stitch_email', payload.email)
    }

    // Clean URL fragment
    history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    // Corrupted payload — user can recover key manually
    console.warn('Migration payload invalid, use /api/recover to restore key')
  }
}

async function validateAndStore(key: string, email: string | null): Promise<void> {
  const res = await fetch('/api/validate-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })

  if (!res.ok) return

  const data = await res.json()
  const license: StoredLicense = {
    key,
    plan: data.plan,
    credits: data.credits,
    expiresAt: data.expiresAt,
    activatedAt: new Date().toISOString(),
    email: email ?? data.email,
  }

  localStorage.setItem('stitch_license', JSON.stringify(license))
}
```

### Why URL Fragment?

The `#migrate=` approach uses URL fragments (hash), which are:
- Never sent to the server (privacy)
- Cleaned up immediately after processing
- Safe from server-side logging

---

## 13.3 URL Redirects

### Vercel Redirect Rules

Add to the old `word2stitch.vercel.app` project's `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "destination": "https://stitchx.com/text/$1",
      "statusCode": 301
    }
  ]
}
```

### Path Mapping

| Old URL | New URL | Notes |
|---------|---------|-------|
| `word2stitch.vercel.app` | `stitchx.com/text` | Main app |
| `word2stitch.vercel.app?t=Hello&f=Georgia` | `stitchx.com/text?t=Hello&f=Georgia` | Shared URLs preserved |
| `word2stitch.vercel.app/inspector.html` | `stitchx.com/fonts` | Font inspector becomes Font Browser |
| `word2stitch.vercel.app/api/rasterize` | `stitchx.com/api/rasterize` | API endpoint |

### Shared URL Backward Compatibility

Existing shared URLs (e.g., `word2stitch.vercel.app?t=Hello&f=GeorgiaPro-Bold.ttf&h=18&c=310`) must work on the new domain. The React rewrite must parse the same query parameters:

| Param | Meaning | Example |
|-------|---------|---------|
| `t` | Text | `Hello` |
| `f` | Font file | `GeorgiaPro-Bold.ttf` |
| `h` | Height | `18` |
| `c` | DMC color code | `310` |
| `a` | Aida count | `14` |
| `al` | Alignment | `center` |

---

## 13.4 Email Notification

### Notification Plan

Send a single email to all existing purchasers (via Lemon Squeezy customer export):

**Subject**: Word2Stitch is now StitchX — your key still works

**Content**:
- Announce the move to `stitchx.com/text`
- Confirm their existing license key works on the new domain
- Explain they now have access to ALL StitchX tools (Pattern Editor, etc.)
- Provide key recovery link: `stitchx.com/text#recover`
- Include direct link to new site with migration parameter

### Timing

- Send 2 weeks before shutting down old domain redirects
- Send reminder 3 days before
- Keep old domain redirect active for minimum 6 months

---

## 13.5 Key Recovery Endpoint

For users who lost their key or migration failed:

```
POST /api/recover
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Flow**:

```
User enters email → POST /api/recover
       │
       ▼
Server queries Lemon Squeezy API for orders by email
       │
       ▼
Found? → Return license key + plan + credits
       │
Not found? → Return 404 with "No purchase found for this email"
```

**Server-side implementation** (Next.js API route):

```typescript
// apps/web/app/api/recover/route.ts
import { NextRequest, NextResponse } from 'next/server'

const LS_API = 'https://api.lemonsqueezy.com/v1'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Query Lemon Squeezy orders by email
  const res = await fetch(
    `${LS_API}/orders?filter[user_email]=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        Accept: 'application/vnd.api+json',
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Service error' }, { status: 502 })
  }

  const data = await res.json()
  const orders = data.data ?? []

  if (orders.length === 0) {
    return NextResponse.json(
      { error: 'No purchase found for this email' },
      { status: 404 }
    )
  }

  // Find most recent valid order
  const latest = orders[0]
  const licenseKey = latest.attributes.first_order_item?.license_key

  if (!licenseKey) {
    return NextResponse.json(
      { error: 'Order found but no license key — contact support' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    key: licenseKey,
    plan: inferPlan(latest.attributes),
    email,
  })
}
```

### Rate Limiting

- 3 requests per email per hour (prevent enumeration)
- Store rate limit counters in Vercel KV

---

## 13.6 Gradual Rollout Strategy

### Phase Timeline

```
Week 0:  Deploy stitchx.com/text (React rewrite)
         ├── Both domains active in parallel
         ├── Old W2S: add banner "We're moving to stitchx.com"
         └── New site: migration receiver active

Week 2:  Email notification to all purchasers
         ├── Include migration link with key in URL fragment
         └── Key recovery endpoint live

Week 4:  Old W2S: show migration interstitial
         ├── "Click to move your account to StitchX"
         ├── Auto-redirect after 10 seconds
         └── "Stay on old version" escape link

Week 8:  Old W2S: permanent 301 redirect
         ├── vercel.json redirects all paths
         ├── Migration script in redirect landing
         └── Keep API endpoints alive (for cached shared URLs)

Week 24: Decommission old Vercel project
         ├── Redirects continue to work (Vercel keeps them)
         └── Remove old repo from Vercel dashboard
```

### Parallel Operation Guarantees

During the transition period (weeks 0-8):

| Aspect | Old W2S | New StitchX |
|--------|---------|-------------|
| **Domain** | `word2stitch.vercel.app` | `stitchx.com/text` |
| **Key format** | `w2s_license_key` | `stitch_license` |
| **API** | `/api/rasterize` (Python serve.py) | `/api/rasterize` (Vercel Python) |
| **Shared URLs** | Works (existing params) | Works (same params) |
| **PDF export** | Works (existing payment) | Works (migrated payment) |
| **New purchases** | Redirect to new site | Active |

### Rollback Plan

If critical issues arise after redirect (week 8):
1. Remove redirects from old `vercel.json`
2. Old site is still deployed and functional
3. Re-enable old domain immediately
4. Investigate and fix, then retry migration

---

## 13.7 Migration Verification Checklist

- [ ] Migration function correctly reads old localStorage keys
- [ ] URL fragment payload encodes/decodes without corruption
- [ ] Key validation succeeds on new domain for old keys
- [ ] `stitch_license` JSON format is correctly populated
- [ ] Free download flag carries over
- [ ] Shared URLs (query params) work identically on new domain
- [ ] 301 redirects preserve query parameters
- [ ] Key recovery endpoint finds orders by email
- [ ] Rate limiting prevents email enumeration
- [ ] Email notification sent to all Lemon Squeezy customers
- [ ] Old domain banner appears before redirect phase
- [ ] Both domains work in parallel during transition
- [ ] Rollback tested: removing redirects restores old site
