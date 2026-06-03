// DEV-ONLY: tile PNGs from a dir into one contact-sheet PNG via Chrome.
// Usage: node scripts/montage.mjs <dir> <out.png> [cols]
import puppeteer from 'puppeteer-core'
import { readdirSync, readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [, , dir, out = '/tmp/sheet.png', colsArg = '4'] = process.argv
const cols = Number(colsArg)
const cell = 300

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .sort((a, b) => {
    const m = (s) => s.match(/_y(\d+)_/)
    if (m(a) && m(b)) return Number(m(a)[1]) - Number(m(b)[1])
    return a.localeCompare(b)
  })

const cards = files
  .map((f) => {
    const b64 = readFileSync(`${dir}/${f}`).toString('base64')
    return `<div class="c">
      <img src="data:image/png;base64,${b64}"/>
      <div class="l">${f.replace('.png', '')}</div>
    </div>`
  })
  .join('')

const html = `<!doctype html><html><head><style>
  body{margin:0;background:#222;font:12px monospace}
  .g{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:4px;padding:4px}
  .c{position:relative;width:${cell}px;height:${cell}px;background:#cfd3d8}
  .c img{width:100%;height:100%;object-fit:cover}
  .l{position:absolute;left:0;bottom:0;background:#000c;color:#fff;padding:2px 5px}
</style></head><body><div class="g">${cards}</div></body></html>`

const rows = Math.ceil(files.length / cols)
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
})
const page = await browser.newPage()
await page.setViewport({
  width: cols * (cell + 4) + 8,
  height: rows * (cell + 4) + 8,
})
await page.setContent(html, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: out })
await browser.close()
console.log('SHEET', out, files.length, 'tiles')
