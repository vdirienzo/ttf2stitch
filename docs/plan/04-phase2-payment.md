# Phase 2 -- Shared Payment Package

> **Goal**: Extract Word2Stitch's Lemon Squeezy integration into a reusable `@stitch/payment`
> package that both apps consume.
> **Depends on**: Phase 1 (monorepo exists)
> **Blocks**: Phase 3 (StitchX payment), Phase 5 (W2S rewrite)

---

## 6.1 Package Structure

> [!WARNING]
> **CRITICAL**: Payment modals (`PaymentModal`, `FreeDownloadModal`, `UpsellModal`) belong
> in `@stitch/payment/components/`, NOT in `@stitch/ui`. Placing them in `@stitch/ui`
> creates a circular dependency: `@stitch/ui` would import from `@stitch/payment` (for
> `usePayment` hooks) while `@stitch/payment` imports from `@stitch/ui` (for shared
> components). Keep payment UI co-located with payment logic.

```
packages/payment/
  src/
    PaymentProvider.tsx        # React Context: license state + actions
    usePayment.ts              # Consumer hook: credits, checkout, validate
    usePaymentGate.ts          # PDF download gate with modal orchestration
    checkout.ts                # Lemon Squeezy overlay iframe checkout
    keyManager.ts              # localStorage CRUD + key format validation
    api.ts                     # Server-side: webhook handler, key validation
    migrate.ts                 # Legacy W2S key migration
    types.ts                   # TypeScript types
    components/
      PaymentModal.tsx         # 3-tier plan selection modal
      PaymentModal.module.css  # Styles (extracted from W2S css/08-auth.css)
      FreeDownloadModal.tsx    # Email capture for first free download
      UpsellModal.tsx          # Post-purchase upsell (single -> pack10)
  package.json
  tsconfig.json
```

`packages/payment/package.json`:

```json
{
  "name": "@stitch/payment",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./components/*": "./src/components/*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@stitch/config": "workspace:*"
  }
}
```

---

## 6.2 Legacy localStorage Key Migration

> [!WARNING]
> **CRITICAL**: Existing Word2Stitch users have license keys stored under `w2s_license_key`
> (a plain string). The new unified system uses `stitch_license` (a JSON object). If we
> don't migrate, paying users lose their purchased credits when the new system rolls out.

### Current W2S localStorage Keys

| Key | Format | Used by |
|-----|--------|---------|
| `w2s_license_key` | Plain string (e.g., `"abc-123-def"`) | `auth.js:5` |
| `w2s_first_free` | `"1"` or absent | `auth.js:6` |
| `w2s_email` | Email string | `auth.js:7` |

### New Unified localStorage Keys

| Key | Format | Used by |
|-----|--------|---------|
| `stitch_license` | `JSON.stringify(StoredLicense)` | `@stitch/payment` |
| `stitch_free_used` | `"true"` or absent | `@stitch/payment` |
| `stitch_email` | Email string | `@stitch/payment` |

### Migration Function

```typescript
// packages/payment/src/migrate.ts

import type { StoredLicense } from './types'

/**
 * Migrate legacy Word2Stitch localStorage keys to the unified format.
 * Runs once on first load. Idempotent -- safe to call multiple times.
 *
 * Migration is ONE-WAY: old keys are removed after successful migration.
 * This prevents double-counting credits if both systems read simultaneously.
 */
export function migrateLegacyKeys(): void {
  try {
    // Skip if already migrated
    if (localStorage.getItem('stitch_license')) return

    const legacyKey = localStorage.getItem('w2s_license_key')
    if (!legacyKey) return

    // Reconstruct license object from legacy plain-string key.
    // We don't know the plan or credits locally -- the server will
    // fill these in on next verification. Use conservative defaults.
    const license: StoredLicense = {
      key: legacyKey,
      plan: 'single',            // Unknown -- server corrects on /api/verify
      credits: 0,                // Unknown -- server corrects on /api/verify
      expiresAt: null,
      activatedAt: new Date().toISOString(),
      email: localStorage.getItem('w2s_email') || '',
    }

    localStorage.setItem('stitch_license', JSON.stringify(license))

    // Migrate free trial flag
    if (localStorage.getItem('w2s_first_free') === '1') {
      localStorage.setItem('stitch_free_used', 'true')
    }

    // Migrate email
    const email = localStorage.getItem('w2s_email')
    if (email) {
      localStorage.setItem('stitch_email', email)
    }

    // Clean up legacy keys (one-way migration)
    localStorage.removeItem('w2s_license_key')
    localStorage.removeItem('w2s_first_free')
    localStorage.removeItem('w2s_email')

    console.log('[payment] Migrated legacy W2S keys to unified format')
  } catch {
    // localStorage unavailable (private browsing, storage full) -- skip silently
  }
}
```

> **Why conservative defaults?** We set `credits: 0` because the legacy system stored only
> the key string, not the credit count. On the next `gatedDownload` call, `usePaymentGate`
> will call `/api/verify` server-side, which returns the real credit balance. The local
> `credits: 0` just means "we don't trust the local count -- ask the server."

---

## 6.3 Core Types

```typescript
// packages/payment/src/types.ts

export type Plan = 'single' | 'pack5' | 'pack10' | 'annual' | 'monthly'

export interface StoredLicense {
  key: string
  plan: Plan
  credits: number         // -1 = unlimited (annual/monthly), 0 = unknown/exhausted
  expiresAt: string | null
  activatedAt: string
  email: string
}

export interface PaymentContextValue {
  license: StoredLicense | null
  isActivated: boolean
  hasCredits: boolean
  creditsRemaining: number    // -1 = unlimited
  freeDownloadUsed: boolean

  // Actions
  activateKey: (key: string) => Promise<boolean>
  openCheckout: (plan: Plan) => void
  deductCredit: () => Promise<boolean>   // Server-side deduction
  checkFreeDownload: () => boolean
  collectEmail: (email: string) => void
  reset: () => void
}

export interface VerifyResponse {
  allowed: boolean
  remaining: number
  error?: 'exhausted' | 'expired' | 'invalid_key' | 'network'
}

export interface ValidateResponse {
  valid: boolean
  plan: Plan
  credits: number
  expiresAt: string | null
  email: string
}
```

---

## 6.4 PaymentProvider Component

```tsx
// packages/payment/src/PaymentProvider.tsx

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { loadLicense, saveLicense, clearLicense } from './keyManager'
import { validateKeyOnServer, verifyAndDeduct } from './api'
import { openLemonSqueezyCheckout } from './checkout'
import { migrateLegacyKeys } from './migrate'
import type { PaymentContextValue, StoredLicense, Plan } from './types'

const PaymentContext = createContext<PaymentContextValue | null>(null)

interface PaymentProviderProps {
  children: ReactNode
  apiBase: string  // e.g., '/api' or 'https://stitchx.com/api'
}

export function PaymentProvider({ children, apiBase }: PaymentProviderProps) {
  // Run legacy migration once on mount
  useEffect(() => { migrateLegacyKeys() }, [])

  const [license, setLicense] = useState<StoredLicense | null>(() => loadLicense())
  const [freeDownloadUsed, setFreeDownloadUsed] = useState(() => {
    try {
      return localStorage.getItem('stitch_free_used') === 'true'
    } catch {
      return false
    }
  })

  const isActivated = license !== null && (
    license.credits > 0 || license.credits === -1
  ) && (
    !license.expiresAt || new Date(license.expiresAt) > new Date()
  )

  const hasCredits = isActivated && (license!.credits > 0 || license!.credits === -1)
  const creditsRemaining = license?.credits ?? 0

  const activateKey = useCallback(async (key: string): Promise<boolean> => {
    const result = await validateKeyOnServer(apiBase, key)
    if (result.valid) {
      const newLicense: StoredLicense = {
        key,
        plan: result.plan,
        credits: result.credits,
        expiresAt: result.expiresAt,
        activatedAt: new Date().toISOString(),
        email: result.email,
      }
      saveLicense(newLicense)
      setLicense(newLicense)
      return true
    }
    return false
  }, [apiBase])

  // --- CRITICAL: Server-side credit deduction ---
  const deductCredit = useCallback(async (): Promise<boolean> => {
    if (!license) return false
    if (license.credits === -1) return true  // Unlimited (annual/monthly)

    // Call server to deduct -- never trust client-side count
    const result = await verifyAndDeduct(apiBase, license.key)
    if (result.allowed) {
      const updated = { ...license, credits: result.remaining }
      saveLicense(updated)
      setLicense(updated)
      return true
    }

    // Key exhausted or invalid -- clear local state
    if (result.error === 'exhausted' || result.error === 'expired' || result.error === 'invalid_key') {
      clearLicense()
      setLicense(null)
    }
    return false
  }, [license, apiBase])

  const checkFreeDownload = useCallback((): boolean => {
    if (freeDownloadUsed) return false
    try { localStorage.setItem('stitch_free_used', 'true') } catch { /* noop */ }
    setFreeDownloadUsed(true)
    return true
  }, [freeDownloadUsed])

  const openCheckout = useCallback((plan: Plan) => {
    openLemonSqueezyCheckout(plan, license?.email)
  }, [license?.email])

  const collectEmail = useCallback((email: string) => {
    try { localStorage.setItem('stitch_email', email) } catch { /* noop */ }
  }, [])

  const reset = useCallback(() => {
    clearLicense()
    setLicense(null)
  }, [])

  return (
    <PaymentContext.Provider value={{
      license, isActivated, hasCredits, creditsRemaining, freeDownloadUsed,
      activateKey, openCheckout, deductCredit, checkFreeDownload, collectEmail, reset,
    }}>
      {children}
    </PaymentContext.Provider>
  )
}

export function usePaymentContext(): PaymentContextValue {
  const ctx = useContext(PaymentContext)
  if (!ctx) throw new Error('usePaymentContext must be used within <PaymentProvider>')
  return ctx
}
```

---

## 6.5 Server-Side Credit Deduction

> [!WARNING]
> **CRITICAL**: Credit deduction MUST happen server-side. The `usePaymentGate` hook must
> call `/api/verify` before allowing the download. If credits are only decremented in
> `localStorage`, users can open DevTools, run `localStorage.setItem('stitch_license',
> JSON.stringify({...credits: 999}))`, and download unlimited PDFs for free.

### Flow: Client Request --> Server Verify --> Client Download

```
gatedDownload() called
       |
       v
POST /api/verify { license_key: "abc-123" }
       |
       v
Server checks Lemon Squeezy API (or local DB):
  - Key valid? Credits > 0? Not expired?
  - YES: Deduct 1 credit SERVER-SIDE, return { allowed: true, remaining: 4 }
  - NO:  Return { allowed: false, error: "exhausted" }
       |
       v
Client receives response:
  - allowed: true  --> Update local credits (for display only), run downloadFn()
  - allowed: false --> Show payment modal
```

### Server API Contract

```typescript
// POST /api/verify
// Request:
{ "license_key": "abc-123-def" }

// Response (success):
{
  "allowed": true,
  "remaining": 4,        // Credits AFTER deduction
  "plan": "pack10",
  "expiresAt": null
}

// Response (failure):
{
  "allowed": false,
  "remaining": 0,
  "error": "exhausted"   // | "expired" | "invalid_key"
}
```

### API Client

```typescript
// packages/payment/src/api.ts

import type { VerifyResponse, ValidateResponse } from './types'

/**
 * Verify key AND deduct one credit server-side.
 * This is the ONLY way credits get consumed.
 */
export async function verifyAndDeduct(
  apiBase: string,
  key: string
): Promise<VerifyResponse> {
  try {
    const res = await fetch(`${apiBase}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key }),
    })
    return await res.json()
  } catch {
    return { allowed: false, remaining: 0, error: 'network' }
  }
}

/**
 * Validate key WITHOUT deducting credits.
 * Used for initial activation and status display.
 */
export async function validateKeyOnServer(
  apiBase: string,
  key: string
): Promise<ValidateResponse> {
  try {
    const res = await fetch(`${apiBase}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key }),
    })
    return await res.json()
  } catch {
    return { valid: false, plan: 'single', credits: 0, expiresAt: null, email: '' }
  }
}
```

> **Two endpoints, two purposes**: `/api/verify` consumes a credit (used at download time).
> `/api/check` is read-only (used at page load to display remaining credits). The current
> W2S `auth.js` already uses this pattern -- `verifyLicenseKey()` at line 52 and
> `checkLicenseKey()` at line 64.

---

## 6.6 usePaymentGate Hook

The key abstraction -- wraps any "download PDF" action with the payment check:

```typescript
// packages/payment/src/usePaymentGate.ts

import { useCallback, useState, useRef } from 'react'
import { usePaymentContext } from './PaymentProvider'

interface UsePaymentGateReturn {
  gatedDownload: (downloadFn: () => Promise<void>) => Promise<void>
  showFreeModal: boolean
  showPayModal: boolean
  showUpsellModal: boolean
  closeFreeModal: () => void
  closePayModal: () => void
  closeUpsellModal: () => void
  isProcessing: boolean
}

export function usePaymentGate(): UsePaymentGateReturn {
  const {
    hasCredits, checkFreeDownload, deductCredit, freeDownloadUsed
  } = usePaymentContext()

  const [showFreeModal, setShowFreeModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showUpsellModal, setShowUpsellModal] = useState(false)
  const [pendingDownload, setPendingDownload] = useState<(() => Promise<void>) | null>(null)

  // Double-click race condition guard
  const processingRef = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const gatedDownload = useCallback(async (downloadFn: () => Promise<void>) => {
    // Prevent double-click: if already processing, ignore
    if (processingRef.current) return
    processingRef.current = true
    setIsProcessing(true)

    try {
      // 1. Has credits? --> verify server-side and download
      if (hasCredits) {
        const allowed = await deductCredit()
        if (allowed) {
          await downloadFn()
        } else {
          // Server said no -- show payment modal
          setPendingDownload(() => downloadFn)
          setShowPayModal(true)
        }
        return
      }

      // 2. First time? --> free download (no server call needed)
      if (!freeDownloadUsed) {
        setPendingDownload(() => downloadFn)
        setShowFreeModal(true)
        return
      }

      // 3. No credits, not first time --> show payment modal
      setPendingDownload(() => downloadFn)
      setShowPayModal(true)
    } finally {
      processingRef.current = false
      setIsProcessing(false)
    }
  }, [hasCredits, freeDownloadUsed, deductCredit])

  return {
    gatedDownload,
    showFreeModal, showPayModal, showUpsellModal,
    closeFreeModal: () => setShowFreeModal(false),
    closePayModal: () => setShowPayModal(false),
    closeUpsellModal: () => setShowUpsellModal(false),
    isProcessing,
  }
}
```

> **Why `useRef` for the guard?** `useState` updates are asynchronous -- by the time
> `setIsProcessing(true)` takes effect, a fast double-click has already fired the second
> call. `useRef` updates synchronously, so `processingRef.current = true` blocks the
> second call immediately. The `useState` version (`isProcessing`) is for rendering
> a disabled/loading state on the button.

---

## 6.7 usePayment Hook

Convenience hook for components that need payment state but not the gate:

```typescript
// packages/payment/src/usePayment.ts

import { usePaymentContext } from './PaymentProvider'
import type { Plan } from './types'

export function usePayment() {
  const ctx = usePaymentContext()

  return {
    // State
    isActivated: ctx.isActivated,
    hasCredits: ctx.hasCredits,
    creditsRemaining: ctx.creditsRemaining,
    plan: ctx.license?.plan ?? null,
    email: ctx.license?.email ?? null,

    // Actions
    openCheckout: ctx.openCheckout,
    activateKey: ctx.activateKey,
    reset: ctx.reset,
  }
}
```

---

## 6.8 Extraction Map from Current Word2Stitch

Current Word2Stitch payment code lives in `ui-modules/auth.js` (632 lines) plus HTML
templates in `ui-shell.html` and styles in `css/08-auth.css`.

| Current W2S Code | Line(s) | Extract to | Notes |
|------------------|---------|-----------|-------|
| `LICENSE_KEY_STORAGE`, `getLicenseKey()`, `storeLicenseKey()`, `clearLicenseKey()` | `auth.js:5-29` | `keyManager.ts` | Rename keys: `w2s_license_key` --> `stitch_license` |
| `hasUsedFreeTrial()`, `markFreeTrialUsed()` | `auth.js:34-40` | `keyManager.ts` | Rename: `w2s_first_free` --> `stitch_free_used` |
| `getStoredEmail()`, `storeEmail()` | `auth.js:42-48` | `keyManager.ts` | Rename: `w2s_email` --> `stitch_email` |
| `verifyLicenseKey()` | `auth.js:52-60` | `api.ts` (`verifyAndDeduct`) | Server-side credit deduction |
| `checkLicenseKey()` | `auth.js:64-72` | `api.ts` (`validateKeyOnServer`) | Read-only check |
| `requestPdfDownload()` | `auth.js:120-152` | `usePaymentGate.ts` | React hook replaces imperative flow |
| `CHECKOUT_URLS`, `goToCheckout()` | `auth.js:366-418` | `checkout.ts` | Keep direct URL approach |
| `showCheckoutOverlay()`, `closeCheckoutOverlay()` | `auth.js:179-229` | `checkout.ts` | Iframe overlay + Safari/Brave fallback |
| `handlePaymentSuccess()`, `extractOrderId()`, `autoActivateOrder()` | `auth.js:231-301` | `checkout.ts` | Post-purchase activation flow |
| `showLicenseKeyPrompt()` | `auth.js:303-323` | `components/PaymentModal.tsx` | Key-only mode in React |
| `window.addEventListener('message', ...)` (LS postMessage) | `auth.js:326-347` | `checkout.ts` | Extract to `useEffect` cleanup |
| `showPaymentModal()`, `hidePaymentModal()` | `auth.js:76-116` | `components/PaymentModal.tsx` | React state replaces DOM manipulation |
| `showFreeModal()`, `hideFreeModal()` | `auth.js:509-525` | `components/FreeDownloadModal.tsx` | React component |
| `showUpsellModal()`, `hideUpsellModal()`, `maybeShowUpsell()` | `auth.js:570-597` | `components/UpsellModal.tsx` | React component |
| `initAuth()` | `auth.js:601-631` | `PaymentProvider.tsx` (`useEffect`) | Migration + restore pending state |
| `pay-modal` HTML in `ui-shell.html` | HTML template | `components/PaymentModal.tsx` | JSX conversion |
| `free-modal` HTML in `ui-shell.html` | HTML template | `components/FreeDownloadModal.tsx` | JSX conversion |
| `upsell-modal` HTML in `ui-shell.html` | HTML template | `components/UpsellModal.tsx` | JSX conversion |
| `css/08-auth.css` | CSS file | `components/PaymentModal.module.css` | CSS Modules |
| `i18n-data.js` (`pay_*`, `free_*`, `upsell_*` keys) | i18n strings | `@stitch/i18n/locales/*/payment.json` | 17 languages |

---

## 6.9 Checkout Module

```typescript
// packages/payment/src/checkout.ts

import type { Plan } from './types'

// Direct checkout URLs from Lemon Squeezy dashboard
const CHECKOUT_URLS: Record<Plan, string> = {
  single: 'https://infinis.lemonsqueezy.com/checkout/buy/54636d22-edf5-4542-bb96-096f8421c872',
  pack5: 'https://infinis.lemonsqueezy.com/checkout/buy/TODO-PACK5-VARIANT-ID',
  pack10: 'https://infinis.lemonsqueezy.com/checkout/buy/8e42106f-beb8-4780-8d19-39ac427f4430',
  annual: 'https://infinis.lemonsqueezy.com/checkout/buy/dcb8543d-c293-42bd-875e-ec7029e2ab95',
  monthly: 'https://infinis.lemonsqueezy.com/checkout/buy/TODO-MONTHLY-VARIANT-ID',
}

/**
 * Open Lemon Squeezy checkout.
 * - Desktop: iframe overlay (embed=1)
 * - Safari/Brave: new tab (popup blocker workaround)
 */
export function openLemonSqueezyCheckout(plan: Plan, email?: string | null): void {
  const baseUrl = CHECKOUT_URLS[plan]
  if (!baseUrl) return

  const params = new URLSearchParams()
  params.set('media', '0')
  params.set('desc', '0')
  params.set('button_color', '#b83a2a')

  if (email) {
    params.set('checkout[email]', email)
  }

  // Auto-detect country from browser locale
  const country = navigator.language?.split('-')[1]
  if (country?.length === 2) {
    params.set('checkout[billing_address][country]', country.toUpperCase())
  }

  // Safari and Brave block third-party iframes -- open in new tab
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const isBrave = !!(navigator as Navigator & { brave?: { isBrave: () => boolean } }).brave

  if (isSafari || isBrave) {
    window.open(`${baseUrl}?${params.toString()}`, '_blank')
    return
  }

  // Desktop: iframe overlay
  params.set('embed', '1')
  showCheckoutOverlay(`${baseUrl}?${params.toString()}`)
}

// ... showCheckoutOverlay(), closeCheckoutOverlay() implementations
// (Extracted from auth.js:179-229 -- iframe creation + loader + timeout)
```

---

## 6.10 Verification Checklist

### Package Build

- [ ] `@stitch/payment` builds independently (`turbo run build --filter=@stitch/payment`)
- [ ] TypeScript compiles with no errors
- [ ] Package exports are correctly configured (`main`, `types`, `exports`)
- [ ] React is a `peerDependency` (not a direct dependency)

### Legacy Migration

- [ ] `migrateLegacyKeys()` converts `w2s_license_key` --> `stitch_license`
- [ ] `migrateLegacyKeys()` converts `w2s_first_free` --> `stitch_free_used`
- [ ] `migrateLegacyKeys()` converts `w2s_email` --> `stitch_email`
- [ ] Migration is idempotent (running twice does not corrupt data)
- [ ] Old keys are removed after successful migration
- [ ] Migration skips gracefully if localStorage is unavailable

### Payment Flow

- [ ] `PaymentProvider` correctly loads license from localStorage on mount
- [ ] `usePaymentGate` gates downloads: free --> paid --> credits
- [ ] **Credit deduction calls `/api/verify` server-side** (not localStorage only)
- [ ] Double-click on "Download PDF" does not deduct two credits
- [ ] Lemon Squeezy checkout overlay opens (desktop browsers)
- [ ] Lemon Squeezy opens in new tab (Safari/Brave)
- [ ] Post-purchase auto-activation works via `/api/activate`
- [ ] Manual key entry works as fallback
- [ ] Key validation via `/api/check` works (read-only, no deduction)

### Server API

- [ ] `POST /api/verify` deducts credit and returns remaining count
- [ ] `POST /api/check` returns credit count without deducting
- [ ] `POST /api/activate` converts order ID to license key
- [ ] `POST /api/payment/webhook` handles Lemon Squeezy events (idempotent)
- [ ] Webhook validates signature before processing

### UI Components

- [ ] `PaymentModal` renders with all 5 plans (single, pack5, pack10, annual, monthly)
- [ ] `FreeDownloadModal` captures email with validation
- [ ] `UpsellModal` shows after single purchase, offers pack10 upgrade
- [ ] All modals close on ESC, backdrop click, and close button
- [ ] i18n works for all 17 languages in payment strings

### Tests

- [ ] Unit tests for `keyManager` (load, save, clear, format validation)
- [ ] Unit tests for `migrateLegacyKeys` (happy path, already migrated, no legacy keys)
- [ ] Unit tests for `PaymentProvider` (state transitions)
- [ ] Unit tests for `usePaymentGate` (free/paid/credit paths + double-click guard)
- [ ] Integration test for full flow: free --> purchase --> activate --> deduct --> exhaust
