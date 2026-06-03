// DEV-ONLY: for every product, sweep yaw (x=0,z=0) and build one contact
// sheet per model so the text-facing orientation can be picked by eye.
// Usage: node scripts/sweep-all.mjs
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3000/turntable'
const SIZE = 560
const CELL = 280
const COLS = 4
const YAWS = [0, 45, 90, 135, 180, 225, 270, 315]
const OUT = '/tmp/sweeps'
mkdirSync(OUT, { recursive: true })

const raw = require('../data/products.json')
const products = Array.isArray(raw) ? raw : Object.values(raw)[0]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 })

for (const p of products) {
  const model = p.model3D
  if (!model) {
    console.log('skip (no model):', p.id)
    continue
  }
  const tiles = []
  for (const y of YAWS) {
    const url = `${BASE}?model=${encodeURIComponent(model)}&x=0&y=${y}&z=0&label=${encodeURIComponent(`${p.id} y${y}`)}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    try {
      await page.waitForFunction(() => window.__captureReady === true, {
        timeout: 15000,
      })
    } catch {
      console.log(`  ! ready timeout ${p.id} y${y}`)
    }
    await new Promise((r) => setTimeout(r, 150))
    const buf = await page.screenshot({ encoding: 'base64' })
    tiles.push({ y, buf })
  }
  // montage this model's yaws
  const cards = tiles
    .map(
      (t) => `<div class="c"><img src="data:image/png;base64,${t.buf}"/>
        <div class="l">y${t.y}</div></div>`,
    )
    .join('')
  const rows = Math.ceil(tiles.length / COLS)
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:#222;font:14px monospace}
    .t{color:#fff;padding:4px 8px;background:#000}
    .g{display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:3px;padding:3px}
    .c{position:relative;width:${CELL}px;height:${CELL}px;background:#cfd3d8}
    .c img{width:100%;height:100%;object-fit:contain}
    .l{position:absolute;left:0;bottom:0;background:#000c;color:#0f0;padding:1px 5px}
  </style></head><body><div class="t">${p.id} · ${p.category}</div>
    <div class="g">${cards}</div></body></html>`
  const sheet = await browser.newPage()
  await sheet.setViewport({
    width: COLS * (CELL + 3) + 6,
    height: rows * (CELL + 3) + 34,
  })
  await sheet.setContent(html, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 200))
  const file = `${OUT}/${p.id}.png`
  await sheet.screenshot({ path: file })
  await sheet.close()
  console.log('✓', file)
}

await browser.close()
console.log('ALL DONE')
