# Phase 1 -- Monorepo Foundation

> **Goal**: Create the Turborepo monorepo, import StitchX, and verify everything still works.
> **Depends on**: Nothing (first phase)
> **Blocks**: Phase 2 (Payment), Phase 4 (Hub)

---

## 5.1 Create Monorepo Scaffold

```bash
mkdir stitchx-platform && cd stitchx-platform
pnpm init
pnpm add turbo --save-dev --workspace-root
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

Create root `.npmrc` to enforce correct React hoisting:

```ini
public-hoist-pattern[]=react
public-hoist-pattern[]=react-dom
shamefully-hoist=false
```

> **Why `.npmrc` matters**: pnpm's strict isolation means React won't be found by nested
> packages unless explicitly hoisted. Without `public-hoist-pattern`, every package that
> imports React will bundle its own copy -- leading to the "multiple React instances" error
> (hooks break when two React copies exist). `shamefully-hoist=false` keeps everything else
> strict so we catch missing `peerDependencies` early.

Create `turbo.json`:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json", "vite.config.*", "next.config.*"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["VITE_*", "NEXT_PUBLIC_*", "LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_WEBHOOK_SECRET"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "inputs": ["src/**", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tests/**", "vitest.config.*"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Create root `package.json`:

```json
{
  "private": true,
  "name": "stitchx-platform",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  },
  "packageManager": "pnpm@10.0.0"
}
```

---

## 5.2 React as peerDependency in All Shared Packages

Every package under `packages/` must declare React as a `peerDependency`, not a direct dependency. This ensures a single React instance across the entire monorepo.

**Template for all `packages/*/package.json`:**

```json
{
  "name": "@stitch/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
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

> **Why peerDependencies?** Shared packages like `@stitch/ui` and `@stitch/payment` are
> consumed by apps that already have React. If they listed React as a direct `dependency`,
> pnpm would install a separate copy per package. With `peerDependencies`, pnpm resolves
> to the host app's React -- one copy for the entire tree.

The pattern applies to: `@stitch/ui`, `@stitch/payment`, `@stitch/i18n`.

**`@stitch/theme` and `@stitch/config`** do NOT need React as a peer (they export CSS/JSON).

---

## 5.3 Import StitchX into `apps/editor/`

```bash
# Copy StitchX source (NOT git clone -- avoid nested repos)
cp -r /home/user/projects/stitchx apps/editor
cd apps/editor
rm -rf .git  # Remove nested git
```

**Modify `apps/editor/vite.config.ts`:**

```typescript
export default defineConfig({
  base: '/editor/',  // Subpath deployment
  // ... rest of existing config
})
```

**Modify `apps/editor/vercel.json`:**

```json
{
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

**Add bundle analyzer:**

```bash
cd apps/editor
pnpm add -D rollup-plugin-visualizer
```

```typescript
// apps/editor/vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  base: '/editor/',
  plugins: [
    // ... existing plugins
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
})
```

> **Why bundle analysis early?** Before adding `@stitch/payment` (Phase 2) and `@stitch/ui`,
> we want a baseline measurement. After each phase, run `pnpm build` and open
> `dist/stats.html` to verify no unexpected size regressions. Target: editor bundle
> stays under 300KB gzipped.

---

## 5.4 PWA Base Path Migration

> [!WARNING]
> **CRITICAL**: StitchX is a PWA with a Service Worker. Changing `base` from `/` to `/editor/`
> breaks three things: SW registration path, SW scope, and manifest `start_url`. If these
> are not updated together, the PWA will either fail to install or cache the wrong assets.

### 5.4.1 Service Worker Registration

**Current** (`src/lib/pwa/register.ts:28`):

```typescript
registration = await navigator.serviceWorker.register('/sw.js', {
  scope: '/',
});
```

**Required change:**

```typescript
// Use Vite's import.meta.env.BASE_URL which resolves to '/editor/' at build time
const basePath = import.meta.env.BASE_URL || '/';

registration = await navigator.serviceWorker.register(
  `${basePath}sw.js`,
  { scope: basePath }
);
```

> **Why `import.meta.env.BASE_URL`?** Vite automatically sets this to match the `base`
> config. Hardcoding `/editor/` would break local dev (`/`). Using the env variable works
> in both contexts: `pnpm dev` serves from `/`, `pnpm build` outputs for `/editor/`.

### 5.4.2 PWA Manifest

**Current** (`public/manifest.json`):

```json
{
  "start_url": "/",
  "scope": "/"
}
```

**Required change:**

```json
{
  "start_url": "/editor/",
  "scope": "/editor/",
  "icons": [
    {
      "src": "/editor/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/editor/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

> **Why icon paths too?** When `base` changes, all absolute paths in the manifest must be
> updated. Icons referenced with `/icon-192x192.png` will 404 because the assets are now
> served from `/editor/icon-192x192.png`. Vite does NOT auto-rewrite `manifest.json`.

### 5.4.3 Audit `scripts/update-sw-version.js`

**Current** (`scripts/update-sw-version.js:16`):

```javascript
const swPath = join(__dirname, '../public/sw.js');
```

This path is relative to the script location, so it works regardless of `base`. However,
audit the generated `sw.js` itself for hardcoded paths:

**Check for hardcoded cache paths in `public/sw.js`:**

```javascript
// LOOK FOR patterns like:
const URLS_TO_CACHE = [
  '/',           // Must become '/editor/' or use relative paths
  '/index.html', // Must become '/editor/index.html'
  '/assets/',    // Must become '/editor/assets/'
];
```

**Recommendation:** Replace hardcoded absolute paths in `sw.js` with relative paths or
use a build-time variable:

```javascript
// public/sw.js -- Use relative paths (resolved against SW scope)
const URLS_TO_CACHE = [
  './',           // Relative to scope (/editor/)
  './index.html',
  // Hashed assets are already handled by network-first strategy
];
```

### 5.4.4 HTML `<link>` Tag for Manifest

The `index.html` `<link rel="manifest">` must also use the base path:

```html
<!-- Before: -->
<link rel="manifest" href="/manifest.json">

<!-- After (Vite rewrites this automatically when using base): -->
<link rel="manifest" href="/editor/manifest.json">
```

Vite handles this if the link uses a relative path in the source:

```html
<!-- Use relative path in source index.html -->
<link rel="manifest" href="./manifest.json">
```

---

## 5.5 Create Placeholder `apps/web/`

```bash
cd apps
pnpm create next-app@latest web --typescript --app --eslint --no-tailwind --no-src-dir
```

Minimal `apps/web/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main>
      <h1>StitchX Platform</h1>
      <nav>
        <a href="/editor">Pattern Editor</a>
        <a href="/text">Text to Pattern</a>
      </nav>
    </main>
  )
}
```

**Add bundle analyzer to the Next.js app too:**

```bash
cd apps/web
pnpm add -D @next/bundle-analyzer
```

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next'

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const isDev = process.env.NODE_ENV === 'development'

const config: NextConfig = {
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

export default withBundleAnalyzer(config)
```

---

## 5.6 Create Shared Config Package

```
packages/config/
  eslint/
    base.js
  typescript/
    base.json
  package.json
```

`packages/config/typescript/base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  }
}
```

`packages/config/package.json`:

```json
{
  "name": "@stitch/config",
  "version": "0.0.0",
  "private": true
}
```

---

## 5.7 Verification Checklist

### Build and Dev

- [ ] `pnpm install` succeeds from root (no peer dependency warnings for React)
- [ ] `turbo run build` builds all apps and packages
- [ ] `turbo run dev` starts all apps in parallel
- [ ] StitchX editor works at `localhost:5173/editor/`
- [ ] Hub landing works at `localhost:3000`

### PWA (Critical)

- [ ] Service Worker registers at `/editor/sw.js` with scope `/editor/`
- [ ] PWA manifest loads at `/editor/manifest.json`
- [ ] `start_url` resolves to `/editor/`
- [ ] Icons load from `/editor/icon-*.png`
- [ ] "Add to Home Screen" prompt works on mobile
- [ ] Offline mode works (cached assets served from `/editor/` scope)
- [ ] `scripts/update-sw-version.js` still updates version correctly

### Tests

- [ ] All 2200 StitchX tests pass: `turbo run test --filter=editor`
- [ ] All 159 Word2Stitch tests pass (separate, not in monorepo yet)

### Bundle Analysis

- [ ] `rollup-plugin-visualizer` generates `apps/editor/dist/stats.html`
- [ ] Editor bundle baseline recorded (size before Phase 2 additions)
- [ ] `ANALYZE=true pnpm build` generates Next.js bundle report for `apps/web`

### CI

- [ ] CI pipeline passes (GitHub Actions)
- [ ] Turbo cache works in CI (`--cache-dir=.turbo`)

### Deployment

- [ ] Vercel preview deploy for `apps/editor` serves at `/editor/` path
- [ ] Vercel preview deploy for `apps/web` serves at `/`
- [ ] Rewrites from hub to editor work (no CORS errors)
