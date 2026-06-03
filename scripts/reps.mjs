// DEV-ONLY: render one representative per shape-group under several candidate
// "house tilt" looks, side by side, so a human can pick the presentation style.
import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3000/turntable'
const SIZE = 300
const CELL = 240
const OUT = '/tmp/reps.png'

// rep model + its alignment (so it faces text-forward before tilt)
const REPS = [
  { id: 'upright',   model: '/models/projectile_155mm_he_m107/155_mm_HE_M107.gltf', align: [0, 0, 0] },
  { id: 'cartridge', model: '/models/scorpio_223_rem/223_Rem.gltf',                 align: [0, 0, 0] },
  { id: 'box',       model: '/models/hayrick/Hayrick.gltf',                          align: [0, 225, 0] },
  { id: 'rod',       model: '/models/bangalore_torpedo_8x1m/Bangalore_torpedo_8x1m.gltf', align: [0, 0, 0] },
]

// candidate looks: per-group tilt triples
const LOOKS = {
  flat:    { upright: [0, 0, 0],     cartridge: [0, 0, 0],   box: [0, 0, 0],       rod: [0, 0, 0] },
  subtle:  { upright: [-5, -15, 0],  cartridge: [18, 0, 14], box: [-15, -22, 0],   rod: [11.25, 25.7, -22.5] },
  dynamic: { upright: [-8, -28, 0],  cartridge: [25, 0, 20], box: [-22, -32, 0],   rod: [11.25, 25.7, -22.5] },
}
const LOOK_ORDER = ['flat', 'subtle', 'dynamic']

const DIR = '/tmp/reps_tiles'
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE })

let idx = 0
for (const look of LOOK_ORDER) {
  for (const rep of REPS) {
    const [ax, ay, az] = rep.align
    const [tx, ty, tz] = LOOKS[look][rep.id]
    const url =
      `${BASE}?model=${encodeURIComponent(rep.model)}` +
      `&x=${ax}&y=${ay}&z=${az}&tx=${tx}&ty=${ty}&tz=${tz}` +
      `&label=${encodeURIComponent(`${look} · ${rep.id}`)}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    try {
      await page.waitForFunction(() => window.__captureReady === true, { timeout: 15000 })
    } catch { console.log('  ! timeout', look, rep.id) }
    await new Promise((r) => setTimeout(r, 150))
    const buf = await page.screenshot({ encoding: 'base64' })
    const nn = String(idx++).padStart(2, '0')
    writeFileSync(`${DIR}/${nn}_${look}_${rep.id}.png`, Buffer.from(buf, 'base64'))
    console.log('✓', look, rep.id)
  }
}

// montage: 4 cols (one per rep), 3 rows (one per look)
const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()
const cards = files
  .map((f) => {
    const b64 = readFileSync(`${DIR}/${f}`).toString('base64')
    const lbl = f.replace(/^\d+_/, '').replace('.png', '')
    return `<div class="c"><img src="data:image/png;base64,${b64}"/><div class="l">${lbl}</div></div>`
  })
  .join('')
const html = `<!doctype html><html><head><style>
  body{margin:0;background:#1b1b1b;font:12px ui-monospace,monospace}
  .grid{display:grid;grid-template-columns:repeat(4,${CELL}px);gap:3px;padding:3px}
  .c{position:relative;width:${CELL}px;height:${CELL}px;background:#cfd3d8}
  .c img{width:100%;height:100%;object-fit:contain}
  .l{position:absolute;left:0;bottom:0;background:#000c;color:#0f0;padding:1px 5px}
</style></head><body><div class="grid">${cards}</div></body></html>`
const sheet = await browser.newPage()
await sheet.setViewport({ width: 4 * (CELL + 3) + 6, height: 3 * (CELL + 3) + 6 })
await sheet.setContent(html, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 250))
await sheet.screenshot({ path: OUT })
await browser.close()
console.log('REPS', OUT)
