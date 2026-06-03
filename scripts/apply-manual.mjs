// DEV-ONLY one-shot: fold hand-calibrated poses into poses.json as per-model
// `override` (verbatim, wins over group tilt∘align), then they get written by
// `node scripts/bake.mjs`. Re-runnable.
import { readFileSync, writeFileSync } from 'node:fs'

const OVERRIDES = {
  'demolition-charge-hayrick': [179, -64, -180],
  'demolition-charge-tnt-250-g': [-148, 41, -180],
  'demolition-charge-tnt-500-g': [15, -50, 0],
  'black-dough': [11, 52, 0],
  'mortar-round-120-mm-he': [167, 14, 165],
  'rocket-122-mm-he-grad': [15, -41, -22],
  'round-pg-7vm': [-54, 21, 35],
  'round-tb-7vm': [2, -33, 60],
  'round-pg-7vm-practice-t': [3, -45, -22],
  'scorpio-223-rem-fmj-356g': [-120, -141, 14],
  'scorpio-308-win-fmj-950g': [35, 36, 90],
  'scorpio-556x45-m193-nato': [18, 135, 14],
  'scorpio-762x39-fmj-8g': [42, 40, 90],
  'scorpio-9mm-luger-fmj-75g': [27, 135, 14],
  'scorpio-9mm-luger-tfmj-8g': [23, 128, 14],
  'scorpio-9x19-fmj-8g-nato': [22, 130, 14],
}

const path = new URL('./poses.json', import.meta.url)
const poses = JSON.parse(readFileSync(path))
let n = 0
for (const [id, rot] of Object.entries(OVERRIDES)) {
  if (!poses.models[id]) {
    console.log('!! unknown id in poses.json:', id)
    continue
  }
  poses.models[id].override = rot
  n++
}
writeFileSync(path, JSON.stringify(poses, null, 2) + '\n')
console.log(`set ${n} overrides in poses.json`)
