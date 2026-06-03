# Orientation calibration tooling (dev-only)

Sets each product's **default rest pose** (`modelRotation` in `data/products.json`)
so models display text-forward at a consistent per-shape-group "house angle".

These scripts drive **system Chrome** (via `puppeteer-core`, installed with
`npm install --no-save puppeteer-core`) against a dev route, screenshot each
GLTF, and let you pick orientations by eye. The dev server must be running
(`npm run dev`) on **http://localhost:3000**.

## Pieces

- `app/turntable/page.tsx` — dev route that renders ONE model centred under a
  fixed front camera. Query params: `model`, `x/y/z` (alignment Euler°),
  `tx/ty/tz` (outer presentation-tilt Euler°), `label`. Replicates the kiosk's
  fit + `TEXT_MIRROR_FIX` so what you see = what the kiosk shows.
- `scripts/shoot.mjs` — screenshot one model over a yaw/pitch/roll sweep.
- `scripts/montage.mjs` — tile a folder of PNGs into one contact sheet.
- `scripts/sweep-all.mjs` — one yaw-sweep contact sheet per product → `/tmp/sweeps`.
- `scripts/reps.mjs` — compare candidate "house tilt" looks on group reps.
- `scripts/poses.json` — **the source of truth**: per-group `tilt` + per-model
  `align`. Edit this, then re-bake.
- `scripts/render-final.mjs` — render every product in its proposed final pose
  → `/tmp/proof.png` + tiles in `/tmp/final`.
- `scripts/bake.mjs` — compose `tilt ∘ align` into ONE Euler XYZ per model and
  write it as `modelRotation` into `data/products.json`. `--dry` prints only.

## Adjust a single model

1. Find its text-forward yaw: `node scripts/shoot.mjs "<model3D path>" foo 0 "0:360:45" 0 /tmp/x && node scripts/montage.mjs /tmp/x /tmp/x.png 4`
2. Set that model's `align` in `scripts/poses.json` (keep its `group`).
3. `node scripts/bake.mjs` → re-writes `modelRotation`.

## Change the house angle for a whole group

1. Edit the group's `tilt` in `scripts/poses.json` (`upright` / `cartridge` /
   `box` / `rod`).
2. `node scripts/render-final.mjs` to preview, then `node scripts/bake.mjs`.

`bake.mjs` is idempotent — safe to run repeatedly.
