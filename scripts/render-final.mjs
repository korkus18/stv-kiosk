// DEV-ONLY: render every product in its proposed final pose (align + group
// tilt from poses.json) and tile them into one proof sheet for approval.
// Usage: node scripts/render-final.mjs [out.png]
import puppeteer from 'puppeteer-core'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3000/turntable'
const SIZE = 360
const CELL = 230
const COLS = 5
const OUT = process.argv[2] || '/tmp/proof.png'

const products = (() => {
  const raw = require('../data/products.json')
  return Array.isArray(raw) ? raw : Object.values(raw)[0]
})()
const byId = Object.fromEntries(products.map((p) => [p.id, p]))
const poses = JSON.parse(readFileSync(new URL('./poses.json', import.meta.url)))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 })

const TILEDIR = '/tmp/final'
rmSync(TILEDIR, { recursive: true, force: true })
mkdirSync(TILEDIR, { recursive: true })

const ids = Object.keys(poses.models)
const tiles = []
let idx = 0
for (const id of ids) {
  const p = byId[id]
  if (!p || !p.model3D) {
    console.log('skip', id)
    continue
  }
  const m = poses.models[id]
  const [ax, ay, az] = m.align
  const [tx, ty, tz] = poses._groups[m.group].tilt
  const url =
    `${BASE}?model=${encodeURIComponent(p.model3D)}` +
    `&x=${ax}&y=${ay}&z=${az}&tx=${tx}&ty=${ty}&tz=${tz}` +
    `&label=${encodeURIComponent(id)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  try {
    await page.waitForFunction(() => window.__captureReady === true, {
      timeout: 15000,
    })
  } catch {
    console.log('  ! ready timeout', id)
  }
  await new Promise((r) => setTimeout(r, 150))
  const buf = await page.screenshot({ encoding: 'base64' })
  const nn = String(idx++).padStart(2, '0')
  writeFileSync(`${TILEDIR}/${nn}_${id}.png`, Buffer.from(buf, 'base64'))
  tiles.push({ id, group: m.group, buf })
  console.log('✓', id)
}

const cards = tiles
  .map(
    (t) => `<div class="c"><img src="data:image/png;base64,${t.buf}"/>
      <div class="l">${t.id}</div><div class="g">${t.group}</div></div>`,
  )
  .join('')
const rows = Math.ceil(tiles.length / COLS)
const html = `<!doctype html><html><head><style>
  body{margin:0;background:#1b1b1b;font:11px ui-monospace,monospace}
  .grid{display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:3px;padding:3px}
  .c{position:relative;width:${CELL}px;height:${CELL}px;background:#cfd3d8}
  .c img{width:100%;height:100%;object-fit:contain}
  .l{position:absolute;left:0;bottom:0;right:0;background:#000b;color:#fff;padding:1px 4px;font-size:10px}
  .g{position:absolute;right:3px;top:3px;background:#2563eb;color:#fff;padding:0 4px;border-radius:3px;font-size:9px}
</style></head><body><div class="grid">${cards}</div></body></html>`
const sheet = await browser.newPage()
await sheet.setViewport({
  width: COLS * (CELL + 3) + 6,
  height: rows * (CELL + 3) + 6,
})
await sheet.setContent(html, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 250))
await sheet.screenshot({ path: OUT })
await browser.close()
console.log('PROOF', OUT, tiles.length, 'tiles')
