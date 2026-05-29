# STV Kiosk — Project context

## What this is

Production trade-show kiosk for STV GROUP a.s. A standalone Next.js app
that runs a single full-screen experience: a category-filtered product
inventory with an interactive 3D viewer (React Three Fiber) and a HUD
chip overlay. Auto-switches between landscape (1920×1080) and portrait
(1080×1920) layouts via `useOrientation`.

Migrated from the multi-variant demo monorepo (`STV-demo/scorpio`) on
2026-05-29. Only the "Variant C" design is preserved; A/B variants and
the demo rozcestník (hub) are not present.

## Tech stack

- **Next.js 16** (App Router, **static export** — `output: 'export'`)
- **React 19** + **TypeScript** (strict)
- **React Three Fiber** + `@react-three/drei` + `three` — 3D viewer
- **framer-motion** — animations
- **lucide-react** — icons (used inside `EmptyModelPlaceholder`)
- Tailwind/postcss pipeline kept (no Tailwind classes actually used by
  the migrated tree; safe to remove later)

## Structure

```
app/
  layout.tsx         — minimal HTML shell + metadata + manifest link
  page.tsx           — root route; orientation dispatcher
  globals.css        — fonts (Barlow), resets, dev-indicator hide rule
components/
  kiosk/             — the kiosk shell + 3D + HUD
    KioskLandscape   — top bar + sidebar + canvas + right info panel
    KioskPortrait    — vertical hero + pull-up inventory overlay
    KioskCanvas      — R3F scene, GLTF loader, orbit, idle-rotate
    HudChip          — DOM-positioned chip projected from a 3D anchor;
                       owns the AnchorState type
    CategoryFilter   — category pills with counts
    InventorySidebar — left-side list (landscape)
    InventoryOverlay — full-screen list (portrait)
    EmptyModelPlaceholder — DOM placeholder for products without a model
    tokens.ts        — color/spacing tokens
    utils.ts         — HUD anchor positions + product → chip values
  icons/             — StvLion (inline SVG), category-icons (monoline)
  ui/                — STVLogo (inline SVG)
hooks/
  useOrientation.ts  — viewport orientation observer
data/
  products.json      — 23 products
  products.ts        — typed accessors
  categories.ts      — CategoryId + CATEGORIES + getCategory
public/
  models/            — 3 GLTF model directories (Hayrick, Bangalore 4×6ft, Bangalore 8×1m)
  manifest.json      — PWA manifest
reference/           — gitignored: source PDFs (technicke_nabidky) + KIOSK_AUDIT.md
```

## Commands

```bash
npm install
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type-check
npm run build                # static export to out/
```

## Deployment

`npm run build` produces a fully static site in `out/` — HTML, JS, CSS,
3D model assets. Deploy by copying `out/` to nginx web root on the STV VPS.

## Branches

- `main` — production / stable
- `dev` — working branch; merge to `main` for releases

## Notable conventions

- Components import `tokens` (not a `C` namespace) — see
  `components/kiosk/tokens.ts`.
- `HudChip` owns `AnchorState`; `KioskCanvas` writes anchor screen
  coordinates each frame; `HudChip` reads them in a `requestAnimationFrame`
  loop to position itself without re-rendering.
- `data/categories.ts` exports English labels + `iconKey` mapping into
  `components/icons/category-icons.tsx` (brand-faithful monoline icons).
- No `next/image` usage. No API routes. No server-only code paths. The
  app is safe for static export to nginx.

## What was intentionally NOT migrated

- A/B variants (`kiosk-A`, `kiosk-B`, `kiosk-old`, `design-b`, `design-b-legacy`)
- The demo rozcestník (`app/page.tsx` in the source — a variant hub)
- Marketing/section pages (`/strelivo/...`)
- `MissionStripC`, `QRBlock`, scroll providers, GSAP, Lenis
- `previews/` PNG renders (not referenced by this kiosk)
- Audit scripts and screenshots

See `MIGRATION_MANIFEST.md` for the full source→target inventory.
