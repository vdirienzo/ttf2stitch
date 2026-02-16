# Phase 3 -- StitchX Payment Integration

> **Goal**: Add monetization to StitchX. This is the **highest-ROI phase** -- StitchX has
> the most complex tool, the most traffic, and currently generates zero revenue.
> **Depends on**: Phase 2 (`@stitch/payment` package exists)
> **Blocks**: Nothing (revenue starts here)

---

## 7.1 Integration Points

StitchX's current PDF export pipeline (NO payment gate):

```
User clicks "Export PDF" button
       |
       v
PDFExportPanel.tsx --> usePDFExport() hook --> generatePDF() --> downloadPDF()
```

**New flow with server-side payment gate:**

```
User clicks "Export PDF" button
       |
       v
PDFExportPanel.tsx --> usePaymentGate().gatedDownload(
  () => usePDFExport().exportAndDownload(pattern, options, filename)
)
       |
       v
gatedDownload() checks:
  1. Has credits? --> POST /api/verify (server deducts) --> download
  2. First time?  --> Free modal (email capture) --> download --> upsell
  3. No credits?  --> Payment modal --> LS checkout --> activate --> download
```

> [!WARNING]
> **CRITICAL**: The `deductCredit()` call inside `gatedDownload` is an async server call
> to `/api/verify`. It does NOT just decrement a localStorage counter. See Phase 2
> section 6.5 for why this matters.

---

## 7.2 Files to Modify in StitchX

| File | Change | Lines affected |
|------|--------|---------------|
| `apps/editor/package.json` | Add `@stitch/payment` dependency | +2 lines |
| `apps/editor/src/App.tsx` | Wrap root with `<PaymentProvider>` | +5 lines |
| `apps/editor/src/components/PDFExport/PDFExportPanel.tsx` | Import `usePaymentGate`, wrap export button | ~15 lines |
| `apps/editor/src/components/PDFExport/PDFExportPanel.tsx` | Render payment modals conditionally | +10 lines |

> **Minimal surface area**: Only two files need real changes (`App.tsx` and
> `PDFExportPanel.tsx`). The payment logic lives entirely in `@stitch/payment`.

---

## 7.3 Code Changes

### 7.3.1 Add Dependencies

```json
// apps/editor/package.json (add to dependencies)
{
  "dependencies": {
    "@stitch/payment": "workspace:*"
  }
}
```

### 7.3.2 Wrap App with PaymentProvider

```tsx
// apps/editor/src/App.tsx
import { PaymentProvider } from '@stitch/payment'

function App() {
  return (
    <PaymentProvider apiBase="/api">
      {/* ... existing StitchX app (canvas, toolbar, panels, etc.) */}
    </PaymentProvider>
  )
}
```

> **Why `apiBase="/api"`?** In production, StitchX lives at `stitchx.com/editor/` but the
> API routes live at `stitchx.com/api/`. Since both are on the same domain, relative
> paths work. The Vercel rewrites ensure `/api/*` hits the Next.js hub's API routes.

### 7.3.3 Gate PDF Export with Server-Side Verification

```tsx
// apps/editor/src/components/PDFExport/PDFExportPanel.tsx
import { usePaymentGate } from '@stitch/payment'
import { PaymentModal } from '@stitch/payment/components/PaymentModal'
import { FreeDownloadModal } from '@stitch/payment/components/FreeDownloadModal'
import { UpsellModal } from '@stitch/payment/components/UpsellModal'

function PDFExportPanel() {
  const { exportAndDownload } = usePDFExport()
  const {
    gatedDownload,
    showFreeModal,
    showPayModal,
    showUpsellModal,
    closeFreeModal,
    closePayModal,
    closeUpsellModal,
    isProcessing,
  } = usePaymentGate()

  const handleExport = () => {
    gatedDownload(async () => {
      await exportAndDownload(pattern, options, filename)
    })
  }

  return (
    <>
      <button onClick={handleExport} disabled={isProcessing}>
        {isProcessing ? 'Verifying...' : 'Export PDF'}
      </button>

      {showFreeModal ? <FreeDownloadModal onClose={closeFreeModal} /> : null}
      {showPayModal ? <PaymentModal onClose={closePayModal} /> : null}
      {showUpsellModal ? <UpsellModal onClose={closeUpsellModal} /> : null}
    </>
  )
}
```

### 7.3.4 Server Actions for Key Validation (Next.js Hub)

In addition to the REST API routes, add Next.js Server Actions for operations called
from the hub landing page (pricing page, key activation form):

```typescript
// apps/web/app/actions/payment.ts
'use server'

import { validateLicenseKey, checkLicenseStatus } from '@stitch/payment/api'

/**
 * Server Action: Activate a license key.
 * Called from the hub's key activation form (pricing page).
 * Runs server-side -- key never exposed in client bundle.
 */
export async function activateKey(key: string): Promise<{
  valid: boolean
  credits: number
  plan: string
  error?: string
}> {
  // Input validation at system boundary
  if (!key || typeof key !== 'string' || key.length > 100) {
    return { valid: false, credits: 0, plan: '', error: 'invalid_format' }
  }

  return validateLicenseKey(key)
}

/**
 * Server Action: Check key status without deducting.
 * Used by the pricing page to show "You have X credits remaining".
 */
export async function checkKey(key: string): Promise<{
  valid: boolean
  credits: number
  plan: string
}> {
  if (!key || typeof key !== 'string') {
    return { valid: false, credits: 0, plan: '' }
  }

  return checkLicenseStatus(key)
}
```

> **Why Server Actions AND API routes?** Server Actions are for Next.js pages (hub pricing,
> activation form) -- they run server-side with zero client JS for the fetch logic. API
> routes (`/api/verify`, `/api/check`) are for the Vite apps (editor, text) which can't
> use Server Actions because they're not Next.js.

### 7.3.5 Server-Side Verify in gatedDownload

The full server-side verification flow in the editor:

```
1. User clicks "Export PDF"
2. gatedDownload() called
3. hasCredits is true (local state says credits > 0)
4. deductCredit() fires POST /api/verify { license_key: "abc-123" }
5. Server checks Lemon Squeezy API:
   - Key valid? Credits > 0? Not expired?
   - Deducts 1 credit in Lemon Squeezy / Vercel KV
   - Returns { allowed: true, remaining: 4 }
6. Client updates local credits display: "4 credits remaining"
7. downloadFn() runs --> PDF generated and downloaded
```

If the server returns `{ allowed: false }`:

```
5. Server returns { allowed: false, error: "exhausted" }
6. Client clears local license state
7. Payment modal shown --> user buys more credits
```

---

## 7.4 What Stays Free in StitchX

| Feature | Status | Rationale |
|---------|--------|-----------|
| Full editor (canvas, all 19 tools) | FREE | Core value prop -- users need to create before paying |
| Zoom, pan, undo/redo (50 levels) | FREE | Essential editor functionality |
| Pattern preview | FREE | Users must see what they're buying |
| OXS export | FREE | Open format -- keeps compatibility with Pattern Maker, WinStitch |
| JSON export | FREE | Developer/interop format |
| Image import + K-means++ quantization | FREE | Entry point -- import image, edit, then pay for PDF |
| All drawing tools (pen, fill, line, rect, etc.) | FREE | Core editor |
| Backstitch, french knots, beads, ornaments | FREE | Decoration tools |
| 500+ DMC colors | FREE | Color selection |
| 70+ bitmap fonts (text tool) | FREE | Text rendering |
| i18n (17 languages) | FREE | Accessibility |
| PWA offline mode | FREE | Reliability |
| **PDF export** | **PAID** | One credit per download. First download free. |

> **Philosophy**: Everything that creates value is free. Only the final output (PDF) costs
> money. This maximizes the number of users who reach the "I want this as a PDF" moment.

---

## 7.5 Existing Tests Compatibility

The payment gate is additive -- it wraps the existing export button, it does not modify
the PDF generation code. StitchX's 2200 tests fall into these categories:

| Test category | Affected? | Why |
|--------------|-----------|-----|
| Canvas/drawing tests | No | No changes to drawing logic |
| Pattern model tests | No | No changes to data model |
| Tool tests (19 tools) | No | No changes to tools |
| PDF generation tests | No | `usePDFExport` is unchanged |
| PDF export button tests | **Yes** | Button now calls `gatedDownload` instead of direct export |
| Image import tests | No | No changes |
| OXS export tests | No | OXS remains free, no gate |
| Zustand store tests | No | No changes to state slices |
| i18n tests | No | No changes |
| Playwright E2E tests | **Partial** | PDF download E2E needs mock for `/api/verify` |

**For the ~5-10 affected tests**, mock the `PaymentProvider` to always allow downloads:

```tsx
// tests/helpers/mockPayment.tsx
import { PaymentProvider } from '@stitch/payment'

/**
 * Wrapper that provides a PaymentProvider with all gates bypassed.
 * Use in tests that need to test PDF export without payment logic.
 */
export function MockPaymentProvider({ children }: { children: React.ReactNode }) {
  return (
    <PaymentProvider apiBase="http://localhost:9999">
      {children}
    </PaymentProvider>
  )
}

// In test setup, mock the API to always return allowed:
beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ allowed: true, remaining: 99 }))
  )
})
```

---

## 7.6 Verification Checklist

### Integration

- [ ] StitchX loads with `PaymentProvider` without errors or console warnings
- [ ] `PaymentProvider` reads `stitch_license` from localStorage on mount
- [ ] Legacy `w2s_license_key` is migrated automatically (if user visited W2S before)

### Payment Flow (End-to-End)

- [ ] **First visit, no key**: Click "Export PDF" --> Free modal --> enter email --> PDF downloads
- [ ] **After free used, no key**: Click "Export PDF" --> Payment modal shows 3 plans
- [ ] **Select plan**: Click plan --> Lemon Squeezy checkout opens (iframe or new tab)
- [ ] **Post-purchase**: Checkout completes --> auto-activation via `/api/activate`
- [ ] **Fallback**: If auto-activation fails --> manual key entry prompt
- [ ] **Key activated**: Click "Export PDF" --> server `/api/verify` --> credit deducted --> PDF downloads
- [ ] **Credits display**: Shows "X credits remaining" after each download
- [ ] **Credits exhausted**: Click "Export PDF" --> Payment modal (buy more)
- [ ] **Annual plan**: Unlimited downloads (`credits === -1`), server still verifies expiry
- [ ] **Upsell**: After first single purchase --> upsell modal offers pack10

### Security

- [ ] Credit deduction happens server-side (not just localStorage)
- [ ] Modifying `stitch_license` in DevTools does not grant free downloads
- [ ] `/api/verify` rejects invalid, expired, and exhausted keys
- [ ] Lemon Squeezy webhook signature is validated before processing

### Free Features Remain Free

- [ ] OXS export works without payment gate
- [ ] JSON export works without payment gate
- [ ] All 19 drawing tools work without any payment check
- [ ] Image import works without payment check
- [ ] Pattern preview renders without payment check

### Existing Tests

- [ ] All 2200 existing StitchX tests still pass
- [ ] PDF export tests updated to mock `PaymentProvider`
- [ ] New tests added for payment gate integration (gated + ungated paths)
- [ ] E2E test: full purchase --> download flow (with mocked Lemon Squeezy)

### Performance

- [ ] `@stitch/payment` is lazy-loaded (not in initial bundle)
- [ ] Payment modals use `React.lazy()` for code splitting
- [ ] Bundle size increase from payment integration < 15KB gzipped
- [ ] Verify with `rollup-plugin-visualizer` (see Phase 1 section 5.3)
