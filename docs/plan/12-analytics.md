# 12. Analytics & Conversion Tracking

> Track user behavior across the StitchX platform to optimize conversion funnels and revenue.

---

## Conversion Events

14 events that map the complete user journey from landing to purchase.

| # | Event Name | Trigger | Properties | Funnel Stage |
|---|-----------|---------|------------|--------------|
| 1 | `page_view` | Any page load | `{ tool, path, referrer }` | Awareness |
| 2 | `pattern_preview` | User generates a pattern preview | `{ tool, font?, dimensions }` | Engagement |
| 3 | `free_modal_shown` | Free download modal appears | `{ tool }` | Conversion (free) |
| 4 | `free_email_submitted` | User submits email for free download | `{ tool, email_domain }` | Conversion (free) |
| 5 | `free_download_completed` | First free PDF downloaded | `{ tool, pattern_size }` | Conversion (free) |
| 6 | `pay_modal_shown` | Payment modal appears (after free used) | `{ tool }` | Conversion (paid) |
| 7 | `checkout_started` | User clicks a plan in payment modal | `{ tool, plan }` | Conversion (paid) |
| 8 | `checkout_completed` | Lemon Squeezy purchase successful | `{ tool, plan, amount }` | Revenue |
| 9 | `checkout_abandoned` | Payment modal closed without purchase | `{ tool, plan?, time_open_ms }` | Drop-off |
| 10 | `upsell_shown` | Post-purchase upsell modal appears | `{ tool, current_plan }` | Upsell |
| 11 | `upsell_accepted` | User upgrades via upsell | `{ tool, from_plan, to_plan }` | Upsell |
| 12 | `upsell_skipped` | User dismisses upsell modal | `{ tool, current_plan }` | Upsell |
| 13 | `paid_download_completed` | Paid PDF downloaded (credit deducted) | `{ tool, credits_remaining }` | Retention |
| 14 | `key_activated` | License key manually activated | `{ tool, plan }` | Activation |

**Notes:**
- `tool` is always one of: `hub`, `editor`, `text`, `convert`, `fonts`, `palette`
- `email_domain` is only the domain part (e.g., `gmail.com`), never the full email address
- `amount` is the Lemon Squeezy gross amount in USD cents
- `plan` is one of: `single`, `pack5`, `pack10`, `annual`, `monthly`

---

## Implementation

### Vercel Analytics Custom Events

Primary tracking via `@vercel/analytics`. Zero-config for page views; custom events for conversion actions.

```typescript
// packages/payment/src/analytics.ts
import { track } from '@vercel/analytics'

type EventName =
  | 'page_view'
  | 'pattern_preview'
  | 'free_modal_shown'
  | 'free_email_submitted'
  | 'free_download_completed'
  | 'pay_modal_shown'
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_abandoned'
  | 'upsell_shown'
  | 'upsell_accepted'
  | 'upsell_skipped'
  | 'paid_download_completed'
  | 'key_activated'

interface EventProperties {
  tool: string
  [key: string]: string | number | boolean | undefined
}

export function trackEvent(name: EventName, properties: EventProperties): void {
  // Vercel Analytics (primary)
  try {
    track(name, properties)
  } catch {
    // Analytics should never break the app
  }

  // sendBeacon fallback for critical revenue events
  if (isRevenueEvent(name)) {
    sendBeaconFallback(name, properties)
  }
}

function isRevenueEvent(name: EventName): boolean {
  return [
    'checkout_completed',
    'upsell_accepted',
    'free_email_submitted',
  ].includes(name)
}

function sendBeaconFallback(name: EventName, properties: EventProperties): void {
  if (!navigator.sendBeacon) return

  const payload = JSON.stringify({
    event: name,
    properties,
    timestamp: Date.now(),
  })

  // Send to our own endpoint as backup
  navigator.sendBeacon('/api/events', payload)
}
```

### Usage in Components

```typescript
// packages/payment/src/components/FreeDownloadModal.tsx
import { trackEvent } from '../analytics'

function FreeDownloadModal({ tool, onClose, onSubmit }: Props) {
  useEffect(() => {
    trackEvent('free_modal_shown', { tool })
  }, [tool])

  const handleSubmit = (email: string) => {
    trackEvent('free_email_submitted', {
      tool,
      email_domain: email.split('@')[1],
    })
    onSubmit(email)
  }

  // ...
}
```

```typescript
// packages/payment/src/components/PaymentModal.tsx
import { trackEvent } from '../analytics'

function PaymentModal({ tool, onClose }: Props) {
  const openTime = useRef(Date.now())

  useEffect(() => {
    trackEvent('pay_modal_shown', { tool })

    return () => {
      // Track abandonment if modal closes without purchase
      trackEvent('checkout_abandoned', {
        tool,
        time_open_ms: Date.now() - openTime.current,
      })
    }
  }, [tool])

  const handlePlanSelect = (plan: Plan) => {
    trackEvent('checkout_started', { tool, plan })
    openCheckout(plan)
  }

  // ...
}
```

```typescript
// packages/payment/src/checkout.ts
import { trackEvent } from './analytics'

export function handleCheckoutSuccess(tool: string, plan: Plan, amount: number): void {
  trackEvent('checkout_completed', { tool, plan, amount })

  // Show upsell after successful purchase (except annual)
  if (plan !== 'annual') {
    trackEvent('upsell_shown', { tool, current_plan: plan })
  }
}
```

---

## Server-Side Event Counters (Vercel KV)

Lightweight daily counters for real-time dashboards without depending on Vercel Analytics export.

### KV Key Schema

```
events:{YYYY-MM-DD}:{event_name}  →  integer (INCR)
events:{YYYY-MM-DD}:{event_name}:{tool}  →  integer (INCR per tool)
```

### API Route

```typescript
// apps/web/app/api/events/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'

const VALID_EVENTS = new Set([
  'page_view', 'pattern_preview', 'free_modal_shown',
  'free_email_submitted', 'free_download_completed',
  'pay_modal_shown', 'checkout_started', 'checkout_completed',
  'checkout_abandoned', 'upsell_shown', 'upsell_accepted',
  'upsell_skipped', 'paid_download_completed', 'key_activated',
])

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { event, properties } = body

    if (!VALID_EVENTS.has(event)) {
      return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
    }

    const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const tool = properties?.tool || 'unknown'

    // Increment daily counters (fire-and-forget, don't await sequentially)
    await Promise.all([
      kv.incr(`events:${date}:${event}`),
      kv.incr(`events:${date}:${event}:${tool}`),
    ])

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
```

### Dashboard Query Helper

```typescript
// apps/web/app/api/dashboard/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const events = [
    'page_view', 'pattern_preview', 'free_modal_shown',
    'free_email_submitted', 'free_download_completed',
    'pay_modal_shown', 'checkout_started', 'checkout_completed',
    'checkout_abandoned', 'upsell_shown', 'upsell_accepted',
    'upsell_skipped', 'paid_download_completed', 'key_activated',
  ]

  const pipeline = kv.pipeline()
  for (const event of events) {
    pipeline.get(`events:${date}:${event}`)
  }

  const results = await pipeline.exec()

  const counters: Record<string, number> = {}
  events.forEach((event, i) => {
    counters[event] = (results[i] as number) || 0
  })

  return NextResponse.json({ date, counters })
}
```

---

## Conversion Funnel

The primary funnel tracks users from awareness to revenue.

```
page_view                    100%    ████████████████████████████████
    │
    ▼
pattern_preview               40%    ████████████████
    │
    ▼
free_modal_shown              25%    ██████████
    │
    ▼
free_email_submitted          18%    ████████
    │
    ▼
free_download_completed       16%    ███████
    │
    ▼
pay_modal_shown               10%    ████
    │
    ▼
checkout_started               5%    ██
    │
    ▼
checkout_completed             3%    █
```

### Key Conversion Rates to Monitor

| Metric | Formula | Target | Alert If |
|--------|---------|--------|----------|
| **Preview rate** | `pattern_preview / page_view` | > 35% | < 20% |
| **Free modal rate** | `free_modal_shown / pattern_preview` | > 50% | < 30% |
| **Email capture rate** | `free_email_submitted / free_modal_shown` | > 60% | < 40% |
| **Free download rate** | `free_download_completed / free_email_submitted` | > 85% | < 70% |
| **Pay modal rate** | `pay_modal_shown / free_download_completed` | > 50% | < 30% |
| **Checkout start rate** | `checkout_started / pay_modal_shown` | > 40% | < 20% |
| **Purchase rate** | `checkout_completed / checkout_started` | > 50% | < 30% |
| **Upsell conversion** | `upsell_accepted / upsell_shown` | > 15% | < 5% |
| **Overall conversion** | `checkout_completed / page_view` | > 2% | < 1% |

---

## Suggested Dashboards

### Dashboard 1: Daily Overview

Real-time daily metrics using KV counters.

| Metric | Source |
|--------|--------|
| Total page views (by tool) | `events:{date}:page_view:{tool}` |
| Total previews generated | `events:{date}:pattern_preview` |
| Emails collected | `events:{date}:free_email_submitted` |
| Free downloads | `events:{date}:free_download_completed` |
| Purchases (count + revenue) | `events:{date}:checkout_completed` |
| Upsells accepted | `events:{date}:upsell_accepted` |

### Dashboard 2: Conversion Funnel

Weekly/monthly funnel visualization comparing periods.

| View | Content |
|------|---------|
| Funnel chart | 8-step funnel from page_view to checkout_completed |
| Drop-off analysis | Biggest drop-off points with percentages |
| Tool comparison | Side-by-side funnels for editor vs. text |
| Trend | Conversion rate trends over 4-week rolling window |

### Dashboard 3: Revenue

| Metric | Detail |
|--------|--------|
| Daily revenue | Sum of `checkout_completed` amounts |
| Revenue by plan | Breakdown: single vs. pack10 vs. annual |
| Revenue by tool | Which tool drives the most purchases |
| Upsell revenue | Additional revenue from upsell conversions |
| Average order value | Total revenue / number of purchases |
| Revenue per visitor | Total revenue / page views |

### Dashboard 4: Email & Retention

| Metric | Detail |
|--------|--------|
| Emails collected per day | `free_email_submitted` count |
| Email domains distribution | Top 10 email providers |
| Free-to-paid conversion | Users who purchased after free download |
| Credits remaining distribution | How many users are near depletion |
| Key activations | Manual key entries (support/gifted) |

---

## Data Retention

| Data | Retention | Storage |
|------|-----------|---------|
| Vercel Analytics events | 90 days (Vercel Pro) | Vercel Analytics |
| KV daily counters | 1 year | Vercel KV |
| `sendBeacon` backup events | 30 days | Vercel KV (TTL) |
| Aggregated monthly reports | Indefinite | GitHub repo (`docs/reports/`) |

### KV Cleanup Cron

```json
// apps/web/vercel.json
{
  "crons": [
    {
      "path": "/api/cleanup-events",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

```typescript
// apps/web/app/api/cleanup-events/route.ts
import { kv } from '@vercel/kv'

export async function GET(): Promise<Response> {
  // Delete KV keys older than 365 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 365)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Scan for old keys and delete them
  let cursor = 0
  do {
    const [nextCursor, keys] = await kv.scan(cursor, {
      match: 'events:*',
      count: 100,
    })
    cursor = nextCursor

    const oldKeys = keys.filter((key: string) => {
      const dateMatch = key.match(/events:(\d{4}-\d{2}-\d{2})/)
      return dateMatch && dateMatch[1] < cutoffStr
    })

    if (oldKeys.length > 0) {
      const pipeline = kv.pipeline()
      oldKeys.forEach((key: string) => pipeline.del(key))
      await pipeline.exec()
    }
  } while (cursor !== 0)

  return new Response(JSON.stringify({ ok: true }))
}
```

---

## Privacy Considerations

- **No PII in events**: Only `email_domain` (not full email), tool name, plan type
- **No cookies for tracking**: Vercel Analytics is cookie-free
- **sendBeacon fallback**: Only for revenue-critical events, minimal payload
- **GDPR**: No user identification in KV counters (aggregate only)
- **Data minimization**: Only 14 event types, no session recording, no heatmaps
