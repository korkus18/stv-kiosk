# STV Kiosk

Production trade-show kiosk for STV GROUP a.s. — interactive 3D product viewer, PWA, offline-capable.

## Tech stack

- [Next.js 16](https://nextjs.org) with App Router and **static export** (`output: 'export'`)
- [React 19](https://react.dev) + TypeScript (strict)
- [React Three Fiber](https://r3f.docs.pmnd.rs/) + [drei](https://github.com/pmndrs/drei) + [three.js](https://threejs.org) — 3D viewer
- [framer-motion](https://motion.dev) — animations
- [lucide-react](https://lucide.dev) — icon set
- Custom monoline brand icons (inline SVG)

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app boots straight into the kiosk —
no hub, no chooser.

## Production build

```bash
npm run build
```

Produces a fully static site in `out/` (HTML, JS, CSS, model assets).

## Deployment (STV VPS / nginx)

The `out/` folder is the deployable artifact. Copy it to the nginx web
root via SSH:

```bash
npm run build
rsync -avz --delete out/ user@stv-vps:/var/www/stv-kiosk/
```

(Adjust the destination path and user to match the server config.)

## Branches

- **`main`** — production / stable. Tag releases here.
- **`dev`** — working branch. PR / merge into `main` for releases.

## Layout & orientation

The app auto-switches between two responsive layouts based on viewport
orientation:

- **Landscape** (1920×1080) — top bar with category filter, left inventory
  sidebar, 3D viewer with floating HUD chips, right info panel.
- **Portrait** (1080×1920) — top header, category filter, vertical hero
  with prev/next arrows, info panel, pull-up inventory overlay.

Trigger the switch by resizing the browser past the square aspect
ratio, or by rotating a touch device.

## Products & 3D models

23 products live in `data/products.json`. Three currently have GLTF 3D
models under `public/models/`:

- Hayrick demolition charge
- Bangalore torpedo (4×6ft)
- Bangalore torpedo (8×1m)

The remaining 20 fall back to `EmptyModelPlaceholder` until their assets
are produced. Add more by dropping a GLTF tree under `public/models/<id>/`
and setting `model3D` on the matching product in `products.json`.

## Reference materials (local only — gitignored)

- `reference/technicke_nabidky/` — source PDFs that originated `products.json`
- `reference/KIOSK_AUDIT.md` — original design audit from the demo phase

These are not part of the runtime and not version-controlled. Override
the gitignore entry if you'd like them committed.
