# PLANNING.md — Word2Stitch: Monetization with Lemon Squeezy License Keys

> **Goal**: Implement a "Free Preview, Pay for Complete Pattern" model using
> Lemon Squeezy License Keys as the verification + storage layer.
> No new database. No new auth provider. Minimal changes to existing code.
>
> **Execution**: Swarm of 3 agents working in parallel after contracts are defined.

---

## Current State

| Component | Status |
|-----------|--------|
| LS Checkout overlay | Working (iframe postMessage flow) |
| Store | `infinis` (ID `291180`) |
| Variant: one-time $1.99 | `1300617` (active) |
| Variant: subscribe $4.99/mo | `1300610` (active) |
| Payment verification | Client-side only (eludible via console) |
| Webhook | None |
| Database | None |
| Auth | None (Clerk implemented in git history, commit `3ae98f2`) |
| PDF generation | Client-side jsPDF (pdf-modules/*.js) |
| Usage tracking | None |

### Problems with Current Approach

1. **Honor system**: `handlePaymentSuccess()` callable from browser console
2. **No persistence**: Pay once, close browser, state is lost
3. **$4.99/mo for 6-12 uses/year**: Bad deal for casual users, high churn
4. **No webhook**: LS charges the customer but we never verify server-side
5. **No analytics**: No idea how many people pay, download, or convert

---

## Target Architecture

```
                    LEMON SQUEEZY (source of truth)
                   ┌──────────────────────────────────┐
                   │ Products with License Keys:       │
                   │                                    │
                   │ Single  → activation_limit: 1      │
                   │ Pack 10 → activation_limit: 10     │
                   │ Annual  → activation_limit: null    │
                   │           expires_at: +1 year       │
                   └──────┬───────────────┬─────────────┘
                          │               │
                    Webhook POST     License API (public)
                     order_created    POST /v1/licenses/validate
                          │           POST /v1/licenses/activate
                          │               │
                   ┌──────▼───────┐ ┌─────▼──────────┐
                   │ /api/webhook │ │ /api/verify     │
                   │ (log + ack)  │ │ (validate+use)  │
                   └──────────────┘ └─────┬──────────┘
                                          │
                                    ┌─────▼──────────┐
                                    │   Frontend      │
                                    │                  │
                                    │ Has key? ──yes──→ verify → generate complete PDF
                                    │    │              │
                                    │    no             if invalid/exhausted
                                    │    │              │
                                    │    ▼              ▼
                                    │ Generate      Show payment modal
                                    │ PREVIEW PDF   (single / pack / annual)
                                    │ (watermark +       │
                                    │  no materials)     ▼
                                    │               LS checkout overlay
                                    │                    │
                                    │               Checkout.Success
                                    │                    │
                                    │               Key arrives via email
                                    │               User enters key
                                    │                    │
                                    │               ▼
                                    │           verify → generate complete PDF
                                    └──────────────────────────────────────┘
```

### Pricing Model

| Plan | Price | LS Product Type | License Config | Target User |
|------|------:|-----------------|----------------|-------------|
| Single Pattern | $1.99 | One-time | `activation_limit: 1` | First-timer |
| Pattern Pack 10 | $9.99 | One-time | `activation_limit: 10` | Regular user |
| Annual Unlimited | $24.99 | Subscription (yearly) | `activation_limit: null`, `expires_at: +1yr` | Power user |

**Anchoring**: "9 single patterns = $17.91 → Pack 10 saves you 44%"

### PDF Tiers

| | Preview (free) | Complete (paid) |
|--|----------------|-----------------|
| Pattern grid | Full | Full |
| Watermark | "Made with Word2Stitch" diagonal | None |
| Thread legend (DMC codes, meters, skeins) | Hidden | Included |
| Pattern info (fabric, finished size) | Hidden | Included |
| Cut fabric size boxes | Hidden | Included |
| Upgrade CTA page | Included | Not included |

---

## Swarm Execution Plan

### Team Structure

```
┌─────────────────────────────────────────────────────────┐
│                    TEAM LEAD                              │
│              (coordinator / integrator)                    │
├───────────────┬─────────────────┬────────────────────────┤
│  Agent:       │  Agent:         │  Agent:                │
│  backend      │  pdf            │  frontend              │
│               │                 │                        │
│  webhook.py   │  pdf-renderer   │  auth.js               │
│  verify.py    │  (preview mode  │  ui-shell.html         │
│  checkout.py  │   watermark     │  pdf-integration.js    │
│  vercel.json  │   upgrade page) │  pdf-modal.js          │
└───────────────┴─────────────────┴────────────────────────┘
```

### Dependency Graph

```
Fase 0 (Manual) ─── Create LS products + get variant IDs
       │
       ▼
Fase 1 (Parallel) ─┬─ Agent backend ──→ webhook.py, verify.py, checkout.py
                    ├─ Agent pdf ──────→ preview mode in pdf-renderer.js
                    └─ Agent frontend ─→ auth.js, modal, pdf-integration
                        │
                        ▼
Fase 2 (Sequential) ── Integration: assemble.js, wiring, smoke test
       │
       ▼
Fase 3 (Sequential) ── E2E testing
       │
       ▼
Fase 4 (Future) ────── Reactivate Clerk for seamless UX
```

### Contracts (Interfaces between agents)

These contracts MUST be defined before agents start parallel work.

#### Contract 1: `/api/verify` (backend → frontend)

```
POST /api/verify
Content-Type: application/json

Request:  { "license_key": "38b1460a-5104-..." }
Response: {
  "allowed": true,          // can download right now
  "remaining": 7,           // credits left (-1 = unlimited)
  "plan": "pack10",         // "single" | "pack10" | "annual"
  "email": "user@mail.com"  // customer email from LS
}

Error:    { "allowed": false, "error": "invalid_key" }
          { "allowed": false, "error": "exhausted" }
          { "allowed": false, "error": "expired" }
```

#### Contract 2: `/api/webhook` (LS → backend)

```
POST /api/webhook
Headers: X-Signature: <hmac_sha256>
Body: LS webhook payload (order_created event)

Response: 200 OK (must respond quickly)
```

#### Contract 3: `buildPDF()` (pdf → frontend)

```javascript
// Existing signature (unchanged):
buildPDF(text, fontData, dmcColor, aidaCount, orientation)

// New signature (backward compatible):
buildPDF(text, fontData, dmcColor, aidaCount, orientation, options)

// options.preview {boolean} - default false
//   true  → watermark + no legend + upgrade CTA page
//   false → no watermark + full legend (current behavior)
```

#### Contract 4: Payment Modal Plans (frontend ↔ backend)

```javascript
// Plans sent to /api/checkout
{ plan: "single" }   // → LS variant for $1.99 single pattern
{ plan: "pack10" }   // → LS variant for $9.99 pack of 10
{ plan: "annual" }   // → LS variant for $24.99/year unlimited
```

---

## Fase 0: Configure Lemon Squeezy Products (Manual)

> **Owner**: Human (dashboard work, not code)
> **Time**: ~15 minutes

### Step 0.1 — Create 3 products in LS dashboard

Go to [app.lemonsqueezy.com](https://app.lemonsqueezy.com) → Store "infinis" → Products.

| Product Name | Price | Type | License Key |
|---|---:|---|---|
| Word2Stitch - Single Pattern | $1.99 | One-time payment | Enable, `activation_limit: 1` |
| Word2Stitch - Pattern Pack 10 | $9.99 | One-time payment | Enable, `activation_limit: 10` |
| Word2Stitch - Annual Unlimited | $24.99 | Subscription (yearly) | Enable, `activation_limit: unlimited` |

For each product:
- [ ] Create product with name and price
- [ ] Go to product → Variants → click variant → scroll to "License keys"
- [ ] Toggle ON "Generate a license key for this product"
- [ ] Set activation limit as specified above
- [ ] Note the **variant ID** from the URL (needed for Step 1.1)

### Step 0.2 — Configure webhook in LS dashboard

Go to Settings → Webhooks → Create webhook:
- [ ] URL: `https://word2stitch.vercel.app/api/webhook`
- [ ] Events: `order_created`, `subscription_created`, `subscription_expired`, `license_key_created`
- [ ] Set a signing secret → save as `LEMONSQUEEZY_WEBHOOK_SECRET`
- [ ] Note: test with "Send test" button after deploying webhook endpoint

### Step 0.3 — Add environment variable to Vercel

- [ ] `LEMONSQUEEZY_WEBHOOK_SECRET` → Vercel Dashboard → Settings → Env Vars

### Deliverables

```
NEW_VARIANT_SINGLE  = "<variant_id>"
NEW_VARIANT_PACK10  = "<variant_id>"
NEW_VARIANT_ANNUAL  = "<variant_id>"
LEMONSQUEEZY_WEBHOOK_SECRET = "<secret>"
```

---

## Fase 1: Parallel Agent Work

### Agent: backend

> **Scope**: Server-side endpoints for payment verification
> **Files**: `api/webhook.py` (new), `api/verify.py` (new), `api/checkout.py` (modify), `vercel.json` (modify)

#### Task 1.1 — Update `api/checkout.py`

Replace current VARIANTS dict with 3 new plans:

```python
VARIANTS = {
    "single":  "<NEW_VARIANT_SINGLE>",   # $1.99 one-time
    "pack10":  "<NEW_VARIANT_PACK10>",   # $9.99 one-time
    "annual":  "<NEW_VARIANT_ANNUAL>",   # $24.99/year subscription
}
```

Also keep backward compat alias:
```python
    "onetime":   VARIANTS["single"],     # legacy alias
    "subscribe": VARIANTS["annual"],     # legacy alias
```

- [ ] Update VARIANTS dict with new IDs
- [ ] Add `"pack10"` as valid plan
- [ ] Update legacy aliases
- [ ] Test: POST /api/checkout with each plan returns checkout URL

#### Task 1.2 — Create `api/verify.py`

New serverless function (~60 lines). Flow:

1. Receive `{ "license_key": "xxx" }` from frontend
2. Call LS License API: `POST https://api.lemonsqueezy.com/v1/licenses/validate`
   - This is a PUBLIC endpoint (no API key needed)
   - Send: `license_key=xxx`
3. Check response:
   - If `valid: false` → return `{ allowed: false, error: "invalid_key" }`
   - If `license_key.status === "expired"` → return `{ allowed: false, error: "expired" }`
   - If `activation_usage >= activation_limit` (and limit is not null) → return `{ allowed: false, error: "exhausted" }`
4. If valid and has credits → call `POST /v1/licenses/activate` with `instance_name: "download-<timestamp>"`
5. Return `{ allowed: true, remaining: limit - usage - 1, plan: <inferred>, email: meta.customer_email }`

Plan inference from variant:
```python
def infer_plan(variant_id):
    # Map LS variant IDs to plan names
    plans = {
        "<NEW_VARIANT_SINGLE>": "single",
        "<NEW_VARIANT_PACK10>": "pack10",
        "<NEW_VARIANT_ANNUAL>": "annual",
    }
    return plans.get(str(variant_id), "unknown")
```

CORS: same ALLOWED_ORIGINS as checkout.py.

- [ ] Create api/verify.py with license validation + activation
- [ ] Handle all error cases (invalid, expired, exhausted)
- [ ] Return remaining credits
- [ ] Test with curl against LS test mode

#### Task 1.3 — Create `api/webhook.py`

New serverless function (~50 lines). Receives LS webhook events.

1. Read `X-Signature` header
2. Compute HMAC-SHA256 of raw body with `LEMONSQUEEZY_WEBHOOK_SECRET`
3. Compare signatures (constant-time comparison)
4. Parse JSON body
5. Log event type + customer email + order ID (for debugging)
6. Respond 200 immediately (LS retries on timeout)

```python
import hashlib, hmac, json, os
from http.server import BaseHTTPRequestHandler

WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        signature = self.headers.get("X-Signature", "")
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length)

        # Verify HMAC signature
        expected = hmac.new(
            WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            self.send_response(401)
            self.end_headers()
            return

        data = json.loads(raw_body)
        event = data.get("meta", {}).get("event_name", "unknown")
        # Log for debugging (visible in Vercel function logs)
        print(f"[webhook] {event}: {json.dumps(data.get('meta', {}))}")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')
```

- [ ] Create api/webhook.py with HMAC verification
- [ ] Log event metadata
- [ ] Test with LS "Send test" button
- [ ] Verify in Vercel function logs

#### Task 1.4 — Update `vercel.json`

Add new files to serverless functions config:

```json
{
  "functions": {
    "api/*.py": {
      "includeFiles": "fonts/**,src/ttf2stitch/**,server_utils.py"
    }
  }
}
```

No change needed — `api/*.py` glob already catches new files. But verify:
- [ ] Confirm api/verify.py and api/webhook.py are included in deploy
- [ ] Test both endpoints after Vercel deploy

---

### Agent: pdf

> **Scope**: Add preview mode to PDF generation
> **Files**: `pdf-modules/pdf-renderer.js` (modify)

#### Task 2.1 — Add preview mode to `buildPDF()`

Modify `buildPDF()` to accept optional `options` parameter:

```javascript
function buildPDF(text, fontData, dmcColor, aidaCount, orientation, options) {
  var isPreview = options && options.preview;
  // ... existing code ...

  // After grid pages, conditionally add legend or upgrade page
  if (isPreview) {
    pdf.addPage();
    drawUpgradePage(pdf, { margin, pageW, pageH, pageNum: totalPagesWithLegend, totalPages: totalPagesWithLegend });
  } else {
    pdf.addPage();
    drawLegend(pdf, { /* existing params */ });
  }
  // ...
}
```

- [ ] Add `options` parameter to buildPDF (backward compatible, defaults to `{}`)
- [ ] Conditionally skip `drawLegend()` when `options.preview === true`
- [ ] Add `drawUpgradePage()` call for preview mode
- [ ] All existing callers unaffected (no options = full PDF)

#### Task 2.2 — Add watermark to grid pages

Add watermark function and call it in preview mode after drawing each grid page:

```javascript
function drawWatermark(pdf, pageW, pageH) {
  pdf.saveGraphicsState();
  // Semi-transparent diagonal text
  pdf.setGState(new pdf.GState({ opacity: 0.08 }));
  pdf.setFontSize(48);
  pdf.setTextColor(184, 58, 42);
  pdf.setFont('helvetica', 'bold');
  // Rotated diagonal text centered on page
  pdf.text('Word2Stitch', pageW / 2, pageH / 2, {
    align: 'center',
    angle: 35
  });
  pdf.restoreGraphicsState();
}
```

In the grid page loop inside `buildPDF()`, after `drawGridPage()`:
```javascript
if (isPreview) {
  drawWatermark(pdf, pageW, pageH);
}
```

Notes:
- Opacity 0.08 (8%) — visible but doesn't interfere with reading symbols
- Use jsPDF GState for transparency (jsPDF 2.x supports this)
- Brand color `#b83a2a` matches existing header/footer
- 35-degree angle for diagonal placement

- [ ] Create drawWatermark() function
- [ ] Call after each grid page in preview mode
- [ ] Verify watermark doesn't obscure symbols at different cell sizes
- [ ] Test with jsPDF GState opacity

#### Task 2.3 — Create upgrade CTA page

Last page of preview PDF — motivates the user to purchase:

```javascript
function drawUpgradePage(pdf, opts) {
  var margin = opts.margin;
  var pageW = opts.pageW;
  var pageH = opts.pageH;

  // Header
  drawBrandedHeader(pdf, '', '', 0, 0, opts.pageNum, opts.totalPages, margin, pageW);
  drawBrandedFooter(pdf, margin, pageW, pageH);

  var centerX = pageW / 2;
  var y = pageH * 0.3;

  // Title
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('Get the Complete Pattern', centerX, y, { align: 'center' });
  y += 12;

  // Subtitle
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Your pattern preview is ready! Unlock the full version to start stitching.', centerX, y, { align: 'center' });
  y += 20;

  // What's included list
  var items = [
    'Thread legend with exact DMC color codes',
    'Thread length calculation (meters + skeins)',
    'Finished size and cut fabric dimensions',
    'Pattern without watermark',
    'Print-ready at 1:1 scale',
  ];

  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  for (var i = 0; i < items.length; i++) {
    pdf.text('\u2713  ' + items[i], centerX - 60, y);
    y += 7;
  }
  y += 10;

  // Pricing
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(184, 58, 42);
  pdf.text('From just $1.99', centerX, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(120, 120, 120);
  pdf.text('word2stitch.vercel.app', centerX, y, { align: 'center' });
}
```

- [ ] Create drawUpgradePage() function
- [ ] Include list of what the complete PDF contains
- [ ] Include pricing and URL
- [ ] Matches existing brand style (colors, fonts)

---

### Agent: frontend

> **Scope**: New payment flow with license keys + 3-tier modal
> **Files**: `ui-modules/auth.js` (rewrite), `ui-shell.html` (modify modal), `ui-modules/pdf-integration.js` (modify), `pdf-modules/pdf-modal.js` (modify)

#### Task 3.1 — Rewrite `ui-modules/auth.js`

The auth module needs to handle license key storage, verification, and the payment flow:

```javascript
// ui-modules/auth.js — License key verification + payment gate

var LICENSE_KEY_STORAGE = 'w2s_license_key';
var _pendingPdfFn = null;

// -- License key management --

function getLicenseKey() {
  try { return localStorage.getItem(LICENSE_KEY_STORAGE) || ''; }
  catch (e) { return ''; }
}

function storeLicenseKey(key) {
  try { localStorage.setItem(LICENSE_KEY_STORAGE, key); }
  catch (e) { /* silent */ }
}

function clearLicenseKey() {
  try { localStorage.removeItem(LICENSE_KEY_STORAGE); }
  catch (e) { /* silent */ }
}

// -- Server verification --

function verifyLicenseKey(key) {
  return fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: key })
  })
  .then(function(res) { return res.json(); })
  .catch(function() { return { allowed: false, error: 'network' }; });
}

// -- Payment flow --

function requestPdfDownload(generateCompleteFn) {
  var key = getLicenseKey();
  if (!key) {
    // No key → show payment modal
    _pendingPdfFn = generateCompleteFn;
    showPaymentModal();
    return;
  }
  // Has key → verify with server
  verifyLicenseKey(key).then(function(result) {
    if (result.allowed) {
      generateCompleteFn();
      updateCreditsDisplay(result.remaining);
    } else {
      if (result.error === 'exhausted' || result.error === 'expired' || result.error === 'invalid_key') {
        clearLicenseKey();
      }
      _pendingPdfFn = generateCompleteFn;
      showPaymentModal();
    }
  });
}

// -- Credits display (subtle, in corner) --

function updateCreditsDisplay(remaining) {
  var el = document.getElementById('credits-display');
  if (!el) return;
  if (remaining < 0) {
    el.textContent = 'Unlimited';
  } else {
    el.textContent = remaining + ' downloads left';
  }
  el.classList.remove('pay-hidden');
}
```

Key behaviors:
- `requestPdfDownload()` checks for stored license key FIRST
- If key exists → verify server-side → if valid, generate complete PDF
- If no key or invalid → show payment modal
- After successful LS checkout → prompt user for license key (received via email)
- Store key in localStorage for future sessions

- [ ] Implement license key get/store/clear
- [ ] Implement server verification call
- [ ] Rewrite requestPdfDownload() with key-first logic
- [ ] Handle all error states (exhausted, expired, invalid, network)
- [ ] Add credits display updater

#### Task 3.2 — Update payment modal in `ui-shell.html`

Replace current 2-option modal with 3 options + license key input:

```html
<div id="pay-modal" class="pay-hidden">
  <div class="pay-backdrop" id="pay-backdrop"></div>
  <div class="pay-dialog">
    <button class="pay-close" id="pay-close">&times;</button>
    <div class="pay-title">Download Complete Pattern</div>
    <div class="pay-subtitle">Your preview is ready. Unlock the full pattern with materials list.</div>
    <div class="pay-options">
      <button class="pay-option" id="pay-single">
        <span class="pay-option-price">$1.99</span>
        <span class="pay-option-label">This Pattern</span>
        <span class="pay-option-desc">One-time download</span>
      </button>
      <button class="pay-option pay-option-featured" id="pay-pack10">
        <span class="pay-option-badge">Save 44%</span>
        <span class="pay-option-price">$9.99</span>
        <span class="pay-option-label">10 Patterns</span>
        <span class="pay-option-desc">Best for regular stitchers</span>
      </button>
      <button class="pay-option" id="pay-annual">
        <span class="pay-option-price">$24.99<small>/yr</small></span>
        <span class="pay-option-label">Unlimited</span>
        <span class="pay-option-desc">All patterns, one year</span>
      </button>
    </div>
    <div class="pay-divider">
      <span>Already purchased?</span>
    </div>
    <div class="pay-key-input">
      <input type="text" id="pay-key-field" placeholder="Paste your license key" />
      <button id="pay-key-submit">Activate</button>
    </div>
  </div>
</div>
```

- [ ] Replace 2-option modal with 3 options
- [ ] Add "Save 44%" badge to Pack 10
- [ ] Add license key input field at bottom
- [ ] Add "Already purchased?" divider
- [ ] Add credits display element somewhere visible

#### Task 3.3 — Update `ui-modules/pdf-integration.js`

Change the download button flow: always generate preview first.

```javascript
btnDownload.addEventListener('click', function () {
  var color = getCurrentColor();
  if (!currentFontData || !currentText.trim()) { alert(t('alert_no_text')); return; }
  if (typeof generatePDF !== 'function') { alert(t('alert_no_pdf')); return; }
  if (!window.jspdf) { alert(t('alert_no_jspdf')); return; }

  // Always show preview (free, no payment needed)
  generatePDF(currentText, currentFontData, color, currentAida);
});
```

Note: `generatePDF()` (in pdf-modal.js) now always opens the print modal.
The payment gate moves INSIDE the print modal (on Download/Print buttons).

- [ ] Remove `requestPdfDownload()` wrapper from download button
- [ ] Download button always opens print preview (free)
- [ ] Payment gate moves to print modal's Download/Print actions

#### Task 3.4 — Update `pdf-modules/pdf-modal.js`

Modify the print preview modal:
- Preview PDF is generated with `buildPDF(..., { preview: true })`
- "Download PDF" button downloads the FREE preview (with watermark)
- NEW "Download Complete ⭐" button triggers payment verification
- "Print" button also triggers payment verification

```javascript
function generatePDF(text, fontData, dmcColor, aidaCount) {
  // ... existing setup ...

  function buildAndShow(orient) {
    // Build PREVIEW version (watermark, no legend)
    var result = buildPDF(text, fontData, dmcColor, aidaCount, orient, { preview: true });
    // ... show in iframe as before ...
    modal._previewResult = result;
  }

  // ... existing orientation handlers ...

  // Download Preview (free)
  document.getElementById('pmDownload').onclick = function() {
    if (modal._previewResult) {
      modal._previewResult.pdf.save('preview-' + modal._previewResult.filename);
    }
  };

  // Download Complete (paid)
  document.getElementById('pmDownloadComplete').onclick = function() {
    requestPdfDownload(function() {
      var complete = buildPDF(text, fontData, dmcColor, aidaCount, currentOrientation, { preview: false });
      if (complete) complete.pdf.save(complete.filename);
    });
  };

  // Print (paid)
  document.getElementById('pmPrint').onclick = function() {
    requestPdfDownload(function() {
      var complete = buildPDF(text, fontData, dmcColor, aidaCount, currentOrientation, { preview: false });
      if (complete) {
        var blob = complete.pdf.output('blob');
        var url = URL.createObjectURL(blob);
        var printWin = window.open(url, '_blank');
        if (printWin) {
          printWin.addEventListener('load', function() {
            setTimeout(function() { printWin.print(); }, 500);
          });
        }
      }
    });
  };
}
```

Also add the "Download Complete ⭐" button to the modal HTML (in `_createPrintModal()`):

```javascript
'  <div class="pm-actions">',
'    <button class="pm-btn pm-btn-secondary" id="pmDownload">',
'      ... Download Preview',
'    </button>',
'    <button class="pm-btn pm-btn-accent" id="pmDownloadComplete">',
'      ... Download Complete ⭐',
'    </button>',
'    <button class="pm-btn pm-btn-primary" id="pmPrint">',
'      ... Print',
'    </button>',
'  </div>',
```

- [ ] Generate preview PDF by default in modal
- [ ] "Download PDF" downloads free preview
- [ ] Add "Download Complete ⭐" button with payment gate
- [ ] "Print" button uses payment gate
- [ ] Wire up requestPdfDownload() for paid actions

#### Task 3.5 — Wire up payment modal buttons in `auth.js`

Connect the 3 plan buttons and license key input:

```javascript
// Plan buttons
document.getElementById('pay-single').addEventListener('click', function() { goToCheckout('single'); });
document.getElementById('pay-pack10').addEventListener('click', function() { goToCheckout('pack10'); });
document.getElementById('pay-annual').addEventListener('click', function() { goToCheckout('annual'); });

// License key input
document.getElementById('pay-key-submit').addEventListener('click', function() {
  var key = document.getElementById('pay-key-field').value.trim();
  if (!key) return;
  verifyLicenseKey(key).then(function(result) {
    if (result.allowed) {
      storeLicenseKey(key);
      hidePaymentModal();
      if (_pendingPdfFn) { _pendingPdfFn(); _pendingPdfFn = null; }
      updateCreditsDisplay(result.remaining);
    } else {
      alert('Invalid or exhausted license key. Please check and try again.');
    }
  });
});
```

Post-checkout flow (after LS iframe Checkout.Success):
```javascript
function handlePaymentSuccess() {
  closeCheckoutOverlay();
  // Show license key input prompt
  // (LS sent the key to customer's email)
  showLicenseKeyPrompt();
}

function showLicenseKeyPrompt() {
  // Show a friendly prompt: "Check your email for your license key!"
  // Focus the license key input field in the payment modal
  showPaymentModal();
  document.getElementById('pay-key-field').focus();
  // Update subtitle
  document.querySelector('.pay-subtitle').textContent =
    'Check your email for your license key and paste it below.';
}
```

- [ ] Wire 3 plan buttons to goToCheckout()
- [ ] Wire license key input to verify + store
- [ ] After checkout success, prompt for license key
- [ ] Handle successful activation (close modal, generate PDF)

---

## Fase 2: Integration

> **Owner**: Team lead (sequential, after all agents complete)

### Step 2.1 — Run `node assemble.js`

After all file changes, reassemble the frontend:

```bash
cd /home/user/projects/word2stitch/ttf2stitch && node assemble.js
```

- [ ] Verify `public/index.html` is generated without errors
- [ ] Check file size is reasonable (~200KB)

### Step 2.2 — Update `serve.py` startup message

```python
print("Payments:    Lemon Squeezy (License Keys)")
```

- [ ] Update startup message

### Step 2.3 — Local smoke test

```bash
cd /home/user/projects/word2stitch/ttf2stitch && uv run python serve.py
```

1. Open http://localhost:8042
2. Type text, select font, pick color
3. Click "Download PDF"
4. Verify print modal opens with PREVIEW (watermark visible, no legend page)
5. Click "Download PDF" → verify preview downloads (with watermark)
6. Click "Download Complete ⭐" → verify payment modal appears

- [ ] Preview PDF generates correctly
- [ ] Watermark visible but doesn't obscure pattern
- [ ] No legend/materials in preview
- [ ] Upgrade page present in preview
- [ ] Payment modal shows 3 options
- [ ] License key input present

### Step 2.4 — CSS adjustments

The new payment modal elements (Pack 10 badge, key input, divider) need styling.
Update `css/08-auth.css` to include:

- [ ] `.pay-divider` styles (centered "or" line)
- [ ] `.pay-key-input` styles (input + button row)
- [ ] `.pay-option-badge` for "Save 44%"
- [ ] `.pm-btn-accent` for "Download Complete ⭐" button
- [ ] `.credits-display` for remaining credits indicator

---

## Fase 3: Testing

> **Owner**: Team lead

### E2E Test Checklist

| Test | Expected Result |
|------|----------------|
| Create pattern → Download → Preview PDF | Preview with watermark, no legend, upgrade page |
| Enter invalid license key | "Invalid key" error |
| Enter valid key with credits | Complete PDF downloads, credits decrement |
| Use all credits on a Pack 10 | 10th download works, 11th shows payment modal |
| Annual plan, verify unlimited | `remaining: -1`, no limit |
| Expired annual key | "Expired" error, payment modal shown |
| Close browser, reopen, key persists | localStorage preserves key |
| POST /api/webhook with wrong signature | 401 Unauthorized |
| POST /api/webhook with valid signature | 200 OK, event logged |

### API Tests (curl)

```bash
# Test verify endpoint with test license key
curl -X POST https://word2stitch.vercel.app/api/verify \
  -H "Content-Type: application/json" \
  -d '{"license_key": "test-key-here"}'

# Test checkout endpoint with new plans
curl -X POST https://word2stitch.vercel.app/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"plan": "pack10"}'
```

---

## Fase 4: Future — Reactivate Clerk (Optional)

> **When**: After reaching 50+ paying users
> **Why**: Better UX — login by email instead of copy-pasting license keys

### What changes

| Without Clerk (Fase 1-3) | With Clerk (Fase 4) |
|---------------------------|---------------------|
| Paga → recibe key por email → pega en app | Paga → login con email → automático |
| Key stored in localStorage | Key stored in Clerk metadata |
| Switch device = re-enter key | Switch device = login |
| Can't recover key if lost | Key linked to account |

### Recovery plan

```bash
# Clerk code is preserved in git:
git show 3ae98f2:ttf2stitch/auth_utils.py > auth_utils.py
# 101 lines, fully functional JWT verification with JWKS cache
```

### Integration with License Keys

After Clerk reactivation, the flow becomes:
1. User logs in via Clerk (magic link — email only, no password)
2. Backend queries LS API: `GET /v1/license-keys?user_email=<clerk_email>`
3. Returns all active keys for this customer
4. Frontend auto-selects the best key (most credits remaining)
5. No copy-paste needed

---

## File Summary

### New files (2)

| File | Agent | Description |
|------|-------|-------------|
| `api/verify.py` | backend | License key validation + activation via LS API |
| `api/webhook.py` | backend | LS webhook receiver with HMAC verification |

### Modified files (6)

| File | Agent | Changes |
|------|-------|---------|
| `api/checkout.py` | backend | New variant IDs for 3 plans |
| `pdf-modules/pdf-renderer.js` | pdf | Preview mode, watermark, upgrade page |
| `ui-modules/auth.js` | frontend | License key flow, rewrite payment gate |
| `ui-shell.html` | frontend | 3-option modal + license key input |
| `ui-modules/pdf-integration.js` | frontend | Remove payment gate from download button |
| `pdf-modules/pdf-modal.js` | frontend | Preview default, paid Download Complete button |

### Unchanged files

| File | Why unchanged |
|------|---------------|
| `vercel.json` | `api/*.py` glob already catches new files |
| `assemble.js` | No new modules to add |
| `pdf-modules/pdf-legend.js` | Called only when preview=false (existing behavior) |
| `pdf-modules/pdf-helpers.js` | No changes needed |
| `pdf-modules/pdf-bitmap.js` | No changes needed |

### Environment variables

| Variable | Where | New? |
|----------|-------|------|
| `LEMONSQUEEZY_API_KEY` | Vercel env vars | No (existing) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Vercel env vars | **Yes** |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LS License API down | Users can't verify keys | Cache last-known-good state in localStorage |
| User loses license key | Can't download | "Already purchased?" input + LS sends email receipt |
| jsPDF GState not supported | Watermark fails | Fallback: draw watermark text without transparency |
| Too-aggressive watermark | Preview is unusable | Use 8% opacity, test with various cell sizes |
| Someone bypasses client-side check | Free complete PDF | Cost is $0 (no server processing). Target audience won't do this. |
| Pack 10 too many/few credits | Wrong conversion | Monitor usage in LS dashboard, adjust later |

---

## Metrics to Track (Post-Launch)

| Metric | How | Source |
|--------|-----|--------|
| Preview downloads | Vercel Analytics (page views with PDF blob) | Vercel |
| Checkout starts | Count POST /api/checkout calls | Vercel function logs |
| Successful purchases | LS webhook events | LS dashboard + /api/webhook logs |
| License verifications | Count POST /api/verify calls | Vercel function logs |
| Conversion rate | purchases / preview downloads | Calculated |
| Plan distribution | Which plan sells most | LS dashboard |
| Credits exhaustion | How many reach 0 and buy again | LS license key activations |
