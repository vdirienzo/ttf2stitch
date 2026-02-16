# Phase 6 — Cross-Tool Features

> **Goal**: Connect tools so patterns flow between them seamlessly.

**Depends on**: Phase 5 (Word2Stitch React rewrite deployed at `/text`)
**Unlocks**: Phase 7 (ecosystem growth)

---

## 6.1 "Open in Editor" Flow

Generate a pattern in Word2Stitch, then open it in StitchX for full editing with all 19 tools.

### Flow Diagram

```
Word2Stitch (/text)                         StitchX (/editor)
┌───────────────────┐                       ┌───────────────────┐
│                   │                       │                   │
│  User types text  │                       │  Import handler   │
│  + picks font     │                       │  reads pattern    │
│       │           │                       │       │           │
│       v           │                       │       v           │
│  /api/rasterize   │                       │  Creates Pattern  │
│  returns bitmap   │                       │  from bitmap JSON │
│       │           │                       │       │           │
│       v           │                       │       v           │
│  [Open in Editor] │ ── navigate ─────────>│  Full editor with │
│       button      │    with data          │  19 tools ready   │
│                   │                       │                   │
└───────────────────┘                       └───────────────────┘
```

### Data Transfer Strategy

Two strategies based on pattern size:

```typescript
// apps/text/src/components/Export/openInEditor.ts

const MAX_URL_SIZE = 8_000  // Safe URL length limit

export function openInEditor(pattern: BitmapPattern): void {
  const json = JSON.stringify(pattern)

  if (json.length < MAX_URL_SIZE) {
    // Small patterns: encode in URL (shareable, bookmarkable)
    const encoded = btoa(json)
    window.location.href = `/editor?import=${encoded}`
  } else {
    // Large patterns: use sessionStorage (same-origin, survives navigation)
    sessionStorage.setItem('stitch_import_pattern', json)
    window.location.href = '/editor?import=session'
  }
}
```

```typescript
// apps/editor/src/hooks/useImportFromURL.ts (in StitchX)

export function useImportFromURL() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const importParam = params.get('import')
    if (!importParam) return

    let patternJSON: string

    if (importParam === 'session') {
      // Large pattern: read from sessionStorage
      patternJSON = sessionStorage.getItem('stitch_import_pattern') ?? ''
      sessionStorage.removeItem('stitch_import_pattern')  // Clean up
    } else {
      // Small pattern: decode from URL
      patternJSON = atob(importParam)
    }

    if (!patternJSON) return

    try {
      const pattern = JSON.parse(patternJSON)
      // Use existing StitchX import logic
      importBitmapPattern(pattern)
      // Clean URL
      window.history.replaceState(null, '', '/editor')
    } catch {
      console.error('Failed to import pattern from URL')
    }
  }, [])
}
```

### Why `sessionStorage` for Large Patterns

| Approach | Max Size | Shareable | Same-Origin | Survives Nav |
|----------|---------|-----------|-------------|-------------|
| URL base64 | ~8KB | Yes | N/A | Yes |
| `sessionStorage` | ~5MB | No | Required | Yes |
| `localStorage` | ~5MB | No | Required | Persists (leak) |
| `postMessage` | Unlimited | No | Cross-origin | No |

`sessionStorage` is ideal for large patterns: it is scoped to the tab, auto-clears on close (no stale data), and survives same-origin navigation. Since both tools live on `stitchx.com`, same-origin is guaranteed.

---

## 6.2 View Transitions API

Use the View Transitions API for smooth visual transitions when navigating between tools. This provides a native-feeling experience without a SPA router.

```typescript
// packages/ui/src/navigation.ts

export function navigateWithTransition(href: string): void {
  // Feature detection: View Transitions API
  if (!document.startViewTransition) {
    window.location.href = href
    return
  }

  document.startViewTransition(() => {
    window.location.href = href
  })
}
```

```css
/* packages/theme/transitions.css */

/* Cross-fade between tools (default) */
::view-transition-old(root) {
  animation: fade-out 200ms ease-out;
}

::view-transition-new(root) {
  animation: fade-in 200ms ease-in;
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Shared header stays fixed during transition */
::view-transition-group(header) {
  animation-duration: 0s;
}
```

```tsx
// packages/ui/src/SharedHeader.tsx
import { navigateWithTransition } from './navigation'

export function SharedHeader({ currentTool }: { currentTool: string }) {
  const tools = [
    { id: 'editor', label: 'Editor', href: '/editor' },
    { id: 'text', label: 'Text', href: '/text' },
  ]

  return (
    <header style={{ viewTransitionName: 'header' }}>
      <a href="/" onClick={(e) => { e.preventDefault(); navigateWithTransition('/') }}>
        StitchX
      </a>
      <nav>
        {tools.map((tool) => (
          <a
            key={tool.id}
            href={tool.href}
            aria-current={tool.id === currentTool ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigateWithTransition(tool.href)
            }}
          >
            {tool.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
```

**Browser support**: View Transitions API is supported in Chrome 111+, Edge 111+, Opera 97+. For Safari/Firefox, the `navigateWithTransition` function falls back to standard navigation -- no broken experience, just no animation.

---

## 6.3 Shared Font Browser in `@stitch/fonts`

The font browser component lives in `@stitch/fonts` (not `@stitch/ui`) because it is tightly coupled to font data types, the font catalog, and font-specific rendering logic. `@stitch/ui` stays generic (modals, buttons, layout).

```
packages/fonts/
├── src/
│   ├── types.ts              # BitmapFont, Glyph, FontMetadata
│   ├── loader.ts             # fetchFont(), cache, abort
│   ├── catalog.ts            # Font manifest, categories, search
│   ├── components/
│   │   ├── FontBrowser.tsx   # Main browser: search, filter, virtual list
│   │   ├── FontCard.tsx      # Preview card with sample text rendering
│   │   └── FontSearch.tsx    # Search input with debounce + category tabs
│   └── index.ts
├── package.json              # "name": "@stitch/fonts"
└── tsconfig.json
```

```typescript
// packages/fonts/src/components/FontBrowser.tsx
import { useState, useMemo, useCallback } from 'react'
import { FixedSizeGrid } from 'react-window'
import { FontCard } from './FontCard'
import { FontSearch } from './FontSearch'
import type { FontMetadata } from '../types'

interface FontBrowserProps {
  fonts: FontMetadata[]
  selected: string                       // Currently selected font file
  onSelect: (file: string) => void       // Callback when font is picked
  sampleText?: string                    // Text to render in preview cards
  columns?: number                       // Grid columns (default: 3)
}

export function FontBrowser({
  fonts,
  selected,
  onSelect,
  sampleText = 'Abc',
  columns = 3,
}: FontBrowserProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = fonts
    if (category) result = result.filter((f) => f.category === category)
    if (query) {
      const q = query.toLowerCase()
      result = result.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        f.tags.some((t) => t.includes(q))
      )
    }
    return result
  }, [fonts, query, category])

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
      const index = rowIndex * columns + columnIndex
      if (index >= filtered.length) return null
      const font = filtered[index]
      return (
        <div style={style}>
          <FontCard
            font={font}
            isSelected={font.file === selected}
            sampleText={sampleText}
            onClick={() => onSelect(font.file)}
          />
        </div>
      )
    },
    [filtered, selected, sampleText, onSelect, columns],
  )

  return (
    <div>
      <FontSearch query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
      <FixedSizeGrid
        columnCount={columns}
        columnWidth={200}
        height={400}
        rowCount={Math.ceil(filtered.length / columns)}
        rowHeight={120}
        width={columns * 200}
      >
        {Cell}
      </FixedSizeGrid>
    </div>
  )
}
```

### Usage in Both Tools

```tsx
// apps/text/src/components/FontBrowser/FontBrowser.tsx
import { FontBrowser } from '@stitch/fonts'
import { usePatternStore } from '../../store/usePatternStore'
import { useFontList } from './useFontList'

export function TextFontBrowser() {
  const { fontFile, setFont, text } = usePatternStore()
  const { fonts } = useFontList()

  return (
    <FontBrowser
      fonts={fonts}
      selected={fontFile}
      onSelect={setFont}
      sampleText={text.slice(0, 10)}  // Preview user's actual text
    />
  )
}
```

```tsx
// apps/editor/src/components/TextTool/FontPicker.tsx
import { FontBrowser } from '@stitch/fonts'

export function EditorFontPicker({ fonts, selected, onSelect }) {
  return (
    <FontBrowser
      fonts={fonts}
      selected={selected}
      onSelect={onSelect}
      sampleText="ABCDEF"
      columns={2}  // Editor side panel is narrower
    />
  )
}
```

---

## 6.4 Shared Pattern Format

The JSON v2 bitmap format is the lingua franca between all tools:

```
Word2Stitch ─── produces ───> JSON v2 bitmap ───> consumed by ─── StitchX
     |                              |                                  |
     |                         @stitch/fonts                           |
     |                        (shared types)                           |
     v                              v                                  v
  /api/rasterize              BitmapFont type                  importBitmapPattern()
```

Both tools produce and consume the same format. Any pattern from Word2Stitch can be opened in StitchX, and StitchX's text tool uses the same font rendering.

---

## 6.5 Cross-Tool Navigation Summary

| From | To | Trigger | Data Method | Transition |
|------|----|---------|-------------|-----------|
| `/text` | `/editor` | "Open in Editor" button | URL base64 or sessionStorage | View Transition |
| `/editor` | `/text` | "Edit as Text" (future) | URL params (`?t=...&f=...`) | View Transition |
| `/` (hub) | `/editor` | Tool card click | None (fresh start) | View Transition |
| `/` (hub) | `/text` | Tool card click | None (fresh start) | View Transition |
| Any tool | `/pricing` | Header nav or payment modal | None | Standard nav |

---

## 6.6 Verification Checklist

### "Open in Editor"

- [ ] Small patterns (<8KB) transfer via URL base64 correctly
- [ ] Large patterns transfer via sessionStorage correctly
- [ ] sessionStorage entry is cleaned up after import
- [ ] Pattern renders identically in StitchX after import
- [ ] Colors, dimensions, and spacing are preserved
- [ ] Invalid/corrupted import data handled gracefully (error toast)

### View Transitions

- [ ] Cross-fade animation plays in Chrome/Edge on tool switch
- [ ] SharedHeader remains visually stable during transition
- [ ] Fallback to standard navigation in Safari/Firefox (no errors)
- [ ] Navigation does not block or delay (transition is non-blocking)

### Shared Font Browser

- [ ] `@stitch/fonts` FontBrowser renders in both editor and text tool
- [ ] Search filters fonts by name and tags
- [ ] Category tabs filter correctly
- [ ] Virtual list handles 310+ fonts without scroll jank
- [ ] Font selection callback works in both contexts
- [ ] `@stitch/fonts` types are used consistently (no type duplication)

### Cross-Tool State

- [ ] Payment license in localStorage works across `/text` and `/editor`
- [ ] Language selection persists when switching tools
- [ ] Theme tokens applied consistently (no visual jarring between tools)
