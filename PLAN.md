# PLAN.md — Word2Stitch: Production + Auth + Payments + Analytics

> **Objetivo**: Llevar Word2Stitch a producción con autenticación (Clerk), pasarela de pago (Stripe) y métricas (Vercel Analytics/Speed Insights).
>
> **Stack actual**: Vanilla JS (ES5) + Python Serverless Functions en Vercel
>
> **Principio**: Zero cambio de framework — todo se integra sobre el stack existente.

---

## Fase 1: Autenticación con Clerk (Frontend)

### Paso 1.1 — Instalar Clerk desde Vercel Marketplace
- [ ] Ir a [vercel.com/marketplace/clerk](https://vercel.com/marketplace/clerk)
- [ ] Click "Add Integration" → "Create New Clerk Account"
- [ ] Seleccionar el proyecto `word2stitch` / `stitchx`
- [ ] Vercel auto-configura `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` como environment variables
- [ ] En Clerk Dashboard: habilitar email/password + Google OAuth como providers

> **Manual (alternativa)**: Crear cuenta en clerk.com, copiar keys, y agregar manualmente en Vercel Dashboard → Settings → Environment Variables.

### Paso 1.2 — Agregar ClerkJS al frontend
- [ ] Modificar `ui-shell.html`: agregar contenedor `#auth-gate` y `#clerk-user-button`
- [ ] Modificar `assemble.js`: inyectar `<script>` de ClerkJS CDN antes del IIFE de UI
- [ ] Crear `ui-modules/auth.js`: módulo de autenticación que controla:
  - Si no hay sesión → mostrar `#auth-gate` con `Clerk.mountSignIn()`
  - Si hay sesión → ocultar gate, mostrar app, montar `Clerk.mountUserButton()`
  - Exponer `getSessionToken()` para que `api.js` lo use en headers
- [ ] Agregar `auth.js` al array `uiModules` en `assemble.js` (antes de `api.js`)

**Archivos a modificar:**
- `ui-shell.html` — agregar HTML del auth gate y user button
- `assemble.js` — agregar script tag de ClerkJS + incluir `auth.js`
- `ui-modules/init.js` — condicionar `init()` a autenticación exitosa

**Archivo nuevo:**
- `ui-modules/auth.js` — módulo de autenticación (~50 líneas)

### Paso 1.3 — Agregar CSS del auth gate
- [ ] Crear `css/08-auth.css` con estilos del gate (overlay centrado, transición)
- [ ] Agregar `08-auth.css` al array `cssModules` en `assemble.js`

**Archivo nuevo:**
- `css/08-auth.css` — estilos del auth gate (~30 líneas)

---

## Fase 2: Proteger API con Clerk (Backend)

### Paso 2.1 — Agregar dependencia clerk-backend-api
- [ ] Agregar `PyJWT>=2.8.0` y `cryptography>=42.0.0` a `requirements.txt` y `pyproject.toml`
- [ ] (Clerk Python SDK es pesado para serverless — usamos verificación JWT manual con PyJWT + JWKS)

**Archivos a modificar:**
- `requirements.txt` — agregar PyJWT, cryptography
- `pyproject.toml` — agregar a dependencies

### Paso 2.2 — Crear módulo de verificación JWT
- [ ] Crear `auth_utils.py` en raíz del proyecto (junto a `server_utils.py`)
- [ ] Implementar:
  - `fetch_jwks()` — obtener JSON Web Key Set de Clerk (con cache en memoria)
  - `verify_clerk_token(token)` — decodificar y validar JWT contra JWKS
  - `get_auth_user(handler)` — extraer Bearer token del header Authorization
- [ ] El JWKS endpoint de Clerk es: `https://<frontend-api>/.well-known/jwks.json`

**Archivo nuevo:**
- `auth_utils.py` — verificación JWT (~60 líneas)

### Paso 2.3 — Proteger endpoint `/api/rasterize`
- [ ] Modificar `api/rasterize.py`: agregar verificación JWT antes de rasterizar
- [ ] Si el token es inválido → 401 Unauthorized
- [ ] Si es válido → continuar con rasterización normal
- [ ] Modificar `do_OPTIONS` para incluir `Authorization` en `Access-Control-Allow-Headers`

**Archivos a modificar:**
- `api/rasterize.py` — agregar auth check
- `vercel.json` — agregar `auth_utils.py` a `includeFiles`

### Paso 2.4 — Actualizar fetch del frontend con auth header
- [ ] Modificar `ui-modules/api.js`: `rasterizeFont()` debe incluir `Authorization: Bearer <token>` en el fetch
- [ ] Usar `getSessionToken()` expuesto por `auth.js`
- [ ] `fetchFontList()` sigue sin auth (endpoint público)

**Archivos a modificar:**
- `ui-modules/api.js` — agregar header Authorization a rasterizeFont()

### Paso 2.5 — Actualizar servidor de desarrollo
- [ ] Modificar `serve.py`: agregar verificación JWT opcional (skip si `CLERK_SECRET_KEY` no está definida)
- [ ] Esto permite seguir desarrollando sin Clerk en local

**Archivos a modificar:**
- `serve.py` — auth condicional para dev

---

## Fase 3: Vercel Analytics y Speed Insights

### Paso 3.1 — Habilitar Web Analytics desde Vercel Dashboard
- [ ] Ir a Vercel Dashboard → Proyecto → Analytics → Enable
- [ ] Vercel inyecta automáticamente el script de tracking en deploys
- [ ] Free tier: 50,000 eventos/mes (más que suficiente para arrancar)
- [ ] Métricas incluidas: visitors, page views, top pages, referrers, countries, devices, OS, browsers

### Paso 3.2 — Habilitar Speed Insights desde Vercel Dashboard
- [ ] Ir a Vercel Dashboard → Proyecto → Speed Insights → Enable
- [ ] Free tier: 10,000 data points/mes
- [ ] Métricas incluidas: Core Web Vitals (LCP, FID, CLS, TTFB, INP)

### Paso 3.3 — Script tag manual (respaldo)
- [ ] Si la inyección automática no funciona (app no Next.js), agregar manualmente:
- [ ] Modificar `assemble.js`: agregar script de Vercel Analytics antes de `</body>`
- [ ] Script: `<script defer src="/_vercel/insights/script.js"></script>`
- [ ] Script: `<script defer src="/_vercel/speed-insights/script.js"></script>`

**Archivos a modificar (solo si necesario):**
- `assemble.js` — agregar scripts de analytics

---

## Fase 4: Pasarela de Pago con Stripe

### Paso 4.1 — Crear cuenta y producto en Stripe
- [ ] Crear cuenta en [stripe.com](https://stripe.com)
- [ ] Crear un Producto ("Word2Stitch Pro") con un Precio (ej: $5/mes o $29 one-time)
- [ ] Obtener `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`
- [ ] Agregar environment variables en Vercel Dashboard

### Paso 4.2 — Crear endpoint `/api/checkout`
- [ ] Crear `api/checkout.py`: serverless function que crea una Stripe Checkout Session
- [ ] Requiere auth (JWT) — solo usuarios autenticados pueden iniciar checkout
- [ ] Redirect a Stripe Checkout hosted page
- [ ] success_url → `https://stitchx.vercel.app/?payment=success`
- [ ] cancel_url → `https://stitchx.vercel.app/?payment=cancelled`

**Archivo nuevo:**
- `api/checkout.py` — crear sesión de Stripe Checkout (~50 líneas)

### Paso 4.3 — Crear endpoint `/api/webhook`
- [ ] Crear `api/webhook.py`: recibe webhooks de Stripe
- [ ] Verificar firma del webhook con `STRIPE_WEBHOOK_SECRET`
- [ ] Evento `checkout.session.completed` → marcar usuario como "paid" en Clerk metadata
- [ ] Usar Clerk Backend API para actualizar `user.public_metadata.plan = "pro"`

**Archivo nuevo:**
- `api/webhook.py` — procesar webhooks de Stripe (~70 líneas)

### Paso 4.4 — Agregar dependencia stripe
- [ ] Agregar `stripe>=8.0.0` a `requirements.txt` y `pyproject.toml`

**Archivos a modificar:**
- `requirements.txt` — agregar stripe
- `pyproject.toml` — agregar a dependencies

### Paso 4.5 — Lógica de acceso por plan en frontend
- [ ] Modificar `ui-modules/auth.js`: después de autenticar, leer `Clerk.user.publicMetadata.plan`
- [ ] Si `plan !== "pro"` → mostrar UI limitada (ej: solo preview, sin PDF export)
- [ ] Agregar botón "Upgrade to Pro" que llama a `/api/checkout`
- [ ] Mostrar badge "PRO" en el user button si tiene plan

**Archivos a modificar:**
- `ui-modules/auth.js` — lógica de plan
- `ui-shell.html` — agregar botón upgrade y badge

### Paso 4.6 — Lógica de acceso por plan en backend
- [ ] Modificar `api/rasterize.py`: después de verificar JWT, leer claims/metadata
- [ ] Si no tiene plan pro → limitar a N rasterizaciones (rate limit) o bloquear features premium
- [ ] Alternativa: verificar metadata via Clerk Backend API en el webhook y confiar en frontend

**Archivos a modificar:**
- `api/rasterize.py` — verificar plan del usuario
- `auth_utils.py` — exponer claims del JWT

---

## Fase 5: Configuración de producción

### Paso 5.1 — Configurar dominio y headers de seguridad
- [ ] Actualizar `vercel.json`: agregar headers de seguridad
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` (permitir Clerk CDN, Stripe, jsPDF CDN)
- [ ] Configurar `Access-Control-Allow-Origin` restrictivo (solo `stitchx.vercel.app`)

### Paso 5.2 — Actualizar vercel.json con nuevas functions
- [ ] Agregar `auth_utils.py` y `stripe` a `includeFiles`
- [ ] Configurar timeout para webhooks (Stripe puede tardar)

**Archivos a modificar:**
- `vercel.json` — headers, includeFiles, functions config

### Paso 5.3 — Environment variables completas
```
# Auth (Clerk) — via Marketplace o manual
CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_SECRET_KEY=sk_live_xxxxx
CLERK_JWKS_URL=https://xxxxx.clerk.accounts.dev/.well-known/jwks.json

# Payments (Stripe) — manual
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID=price_xxxxx
```

### Paso 5.4 — Testing end-to-end
- [ ] Probar flujo completo: landing → sign up → login → uso → upgrade → pago → acceso pro
- [ ] Probar con Stripe test mode (keys `sk_test_*`)
- [ ] Verificar analytics en Vercel Dashboard

---

## Resumen de archivos

### Archivos nuevos (5)
| Archivo | Fase | Descripción |
|---------|------|-------------|
| `ui-modules/auth.js` | 1 | Módulo de autenticación frontend |
| `css/08-auth.css` | 1 | Estilos del auth gate |
| `auth_utils.py` | 2 | Verificación JWT de Clerk en Python |
| `api/checkout.py` | 4 | Crear sesión de Stripe Checkout |
| `api/webhook.py` | 4 | Procesar webhooks de Stripe |

### Archivos modificados (9)
| Archivo | Fases | Cambios |
|---------|-------|---------|
| `ui-shell.html` | 1, 4 | Auth gate HTML, user button, upgrade button |
| `assemble.js` | 1, 3 | ClerkJS script, auth.js module, analytics scripts |
| `ui-modules/init.js` | 1 | Condicionar init a auth |
| `ui-modules/api.js` | 2 | Authorization header en fetch |
| `api/rasterize.py` | 2, 4 | JWT verification, plan check |
| `serve.py` | 2 | Auth condicional para dev |
| `requirements.txt` | 2, 4 | PyJWT, cryptography, stripe |
| `pyproject.toml` | 2, 4 | Mismas dependencias |
| `vercel.json` | 5 | Headers, includeFiles, security |

---

## Progreso

| Fase | Estado | Notas |
|------|--------|-------|
| **Fase 1**: Auth Frontend (Clerk) | | |
|   Paso 1.1 — Instalar Clerk | ⏳ Manual | Usuario debe ir a Vercel Marketplace o crear `.env` local |
|   Paso 1.2 — ClerkJS en frontend | ✅ Hecho | `auth.js` creado + `waitForSession()` fix, `assemble.js` actualizado, `init.js` parcheado |
|   Paso 1.3 — CSS del auth gate | ✅ Hecho | `css/08-auth.css` creado |
| **Fase 2**: Auth Backend (JWT) | | |
|   Paso 2.1 — Dependencias PyJWT | ✅ Hecho | PyJWT 2.11.0 + cryptography 46.0.5 instalados |
|   Paso 2.2 — auth_utils.py | ✅ Hecho | JWKS fetch + JWT verify + bearer token extraction |
|   Paso 2.3 — Proteger /api/rasterize | ✅ Hecho | JWT check condicional + CORS Authorization header |
|   Paso 2.4 — Auth header en frontend | ✅ Hecho | (hecho en Fase 1 — `api.js` ya envía Bearer token) |
|   Paso 2.5 — Actualizar serve.py | ✅ Hecho | .env loader + auth condicional + CORS actualizado |
|   vercel.json | ✅ Hecho | `auth_utils.py` agregado a includeFiles |
|   Tests | ✅ 150 passed | Lint limpio, 0 regresiones |
|   E2E Browser Test | ✅ Verified | Login → auth gate → app → rasterize 200 → canvas rendered |
| **Fase 3**: Analytics (Vercel) | | |
|   Paso 3.1 — Web Analytics | ✅ Hecho | Habilitado en Vercel Dashboard |
|   Paso 3.2 — Speed Insights | ✅ Hecho | Habilitado en Vercel Dashboard |
|   Paso 3.3 — Script tags | ✅ Hecho | `/_vercel/insights/script.js` + `speed-insights/script.js` en `assemble.js` |
| **Fase 4**: Pagos (Stripe) | ⬜ Pendiente | |
| **Fase 5**: Producción | ⬜ Pendiente | |
