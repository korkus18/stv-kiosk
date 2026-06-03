// DEV-ONLY: drive system Chrome to screenshot the /turntable harness.
// Usage: node scripts/shoot.mjs <model> <label> <x> <ySpec> <z> [outdir]
//   ySpec can be a single number or "a,b,c" or "0:360:45" (start:end:step)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3000/turntable'
const SIZE = 720

const [, , model, label, xArg = '0', yArg = '0', zArg = '0', outDir = '/tmp/shots'] =
  process.argv

function expand(spec) {
  if (spec.includes(':')) {
    const [s, e, step] = spec.split(':').map(Number)
    const out = []
    for (let v = s; v < e; v += step) out.push(v)
    return out
  }
  return spec.split(',').map(Number)
}

const xs = expand(xArg)
const ys = expand(yArg)
const zs = expand(zArg)
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    `--window-size=${SIZE},${SIZE}`,
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 })
page.on('console', (m) => {
  const t = m.text()
  if (t.toLowerCase().includes('error')) console.log('  [page]', t)
})

const files = []
for (const x of xs)
  for (const y of ys)
    for (const z of zs) {
      const url = `${BASE}?model=${encodeURIComponent(
        model,
      )}&x=${x}&y=${y}&z=${z}&label=${encodeURIComponent(label)}`
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
      try {
        await page.waitForFunction(() => window.__captureReady === true, {
          timeout: 15000,
        })
      } catch {
        console.log(`  ! ready timeout @ y${y}`)
      }
      await new Promise((r) => setTimeout(r, 250))
      const file = `${outDir}/${label}_x${x}_y${y}_z${z}.png`
      await page.screenshot({ path: file })
      files.push(file)
      console.log(`  ✓ ${file}`)
    }

await browser.close()
console.log('DONE', files.length, 'shots')
