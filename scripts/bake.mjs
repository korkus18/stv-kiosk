// DEV-ONLY: compose each model's (group tilt) ∘ (alignment) into ONE Euler XYZ
// (matching how KioskCanvas.applyPose consumes modelRotation) and inject it as
// `modelRotation` into data/products.json. Idempotent: replaces an existing
// modelRotation line if present, else inserts after the model3D line.
// Usage: node scripts/bake.mjs            (writes file)
//        node scripts/bake.mjs --dry      (prints values only)
import * as THREE from 'three'
import { readFileSync, writeFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry')
const d2r = THREE.MathUtils.degToRad
const r2d = THREE.MathUtils.radToDeg
const round = (n) => {
  const v = Math.round(n * 100) / 100
  return Object.is(v, -0) ? 0 : v
}

const poses = JSON.parse(readFileSync(new URL('./poses.json', import.meta.url)))

function compose(align, tilt) {
  const mA = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(d2r(align[0]), d2r(align[1]), d2r(align[2]), 'XYZ'),
  )
  const mT = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(d2r(tilt[0]), d2r(tilt[1]), d2r(tilt[2]), 'XYZ'),
  )
  // group (tilt) is the PARENT in the turntable → world R = tilt * align
  const m = new THREE.Matrix4().multiplyMatrices(mT, mA)
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ')
  return [round(r2d(e.x)), round(r2d(e.y)), round(r2d(e.z))]
}

const result = {}
for (const [id, m] of Object.entries(poses.models)) {
  // A per-model `override` (hand-dialed in the kiosk calibrator) is written
  // verbatim and wins over the group tilt ∘ align composition — so manual
  // poses survive a group re-bake.
  result[id] = m.override
    ? m.override.map(round)
    : compose(m.align, poses._groups[m.group].tilt)
}

if (DRY) {
  for (const [id, r] of Object.entries(result))
    console.log(id.padEnd(38), JSON.stringify(r))
  process.exit(0)
}

const path = new URL('../data/products.json', import.meta.url)
let text = readFileSync(path, 'utf8')
const products = JSON.parse(text)
let injected = 0

for (const p of products) {
  const r = result[p.id]
  if (!r) continue
  const rotLine = `    "modelRotation": [${r[0]}, ${r[1]}, ${r[2]}],`
  const esc = p.model3D.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const modelLine = new RegExp(`( *)"model3D": "${esc}",`)
  // remove any existing modelRotation right after this model's model3D line
  text = text.replace(
    new RegExp(`( *"model3D": "${esc}",\\n)( *"modelRotation": \\[[^\\]]*\\],\\n)`),
    '$1',
  )
  if (!modelLine.test(text)) {
    console.log('!! model3D line not found for', p.id)
    continue
  }
  text = text.replace(modelLine, (m) => `${m}\n${rotLine}`)
  injected++
}

writeFileSync(path, text)
console.log(`baked modelRotation into ${injected}/${products.length} products`)
