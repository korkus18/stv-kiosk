import * as THREE from 'three'
import type { Product } from '@/data/products'
import type { CategoryId } from '@/data/categories'
import type { KioskMode } from '@/hooks/useKioskMode'

export type KioskSharedProps = {
  activeCategory: CategoryId | 'all'
  setActiveCategory: (id: CategoryId | 'all') => void
  selectedProductId: string
  setSelectedProductId: (id: string) => void
  selectedProduct: Product | undefined
  filteredProducts: Product[]
  /** Interaction mode — attract (idle) vs active (touched). */
  mode: KioskMode
  /** Enter active mode; called by the attract-overlay touch catcher. */
  onActivate: () => void
  /** Reports a model url that failed to load (attract loop skips it). */
  onModelError: (url: string) => void
  /** Next attract model to prefetch (undefined in active). */
  prefetchUrl?: string
  /** Gate: play the slow explode→hold→reassemble flourish on this model in the
   *  attract loop (only if it's also explodable). Default true (all models). */
  attractExplode?: boolean
  /** Canvas → loop: current model's attract sequence finished; advance to next. */
  onAttractAdvance?: () => void
  /** Default model orientation (Euler degrees [x,y,z]) — rest pose for the spin. */
  modelRotation?: [number, number, number]
  /** Exploded view: state + toggle + capability report (driven by the canvas). */
  exploded: boolean
  explodable: boolean
  onToggleExplode: () => void
  onExplodableChange: (explodable: boolean) => void
}

// ── HUD anchor positions (modelGroup local space) ─────────────────────────
// The four category chips ride the corners of an imaginary cube AROUND the
// model and rotate WITH it (projected through the full world matrix, spin
// included — see AnchorProjector). The cube is larger than the model's 0.88
// normalized bbox so the chips sit clearly OUTSIDE the silhouette. Chosen
// corners keep each chip in its screen quadrant (x,y = quadrant) while the z
// sign alternates top/bottom → the cube reads as rotating in depth, not as a
// flat square. Chips are centred on the corner (no offset); their text stays
// upright (HudChip is a DOM billboard).
// Half-size of the imaginary cube the chips ride. The model is framed to ~80% of
// the view, so corners (CUBE_HALF·√3 from centre) must stay inside that to keep
// the chips on-screen and readable. 0.5 sits the chips just outside the model
// silhouette. Main tuning knob — raise for "further out", at the cost of edge clip.
const CUBE_HALF = 0.5
export const HUD_ANCHOR_POSITIONS: ReadonlyArray<{
  id: string
  pos: THREE.Vector3
  align: 'left' | 'right'
  chipOffset: { x: number; y: number }
  delay: number
}> = [
  { id: 'designation', pos: new THREE.Vector3( CUBE_HALF,  CUBE_HALF,  CUBE_HALF), align: 'right', chipOffset: { x: 0, y: 0 }, delay: 0.00 },
  { id: 'type',        pos: new THREE.Vector3(-CUBE_HALF,  CUBE_HALF,  CUBE_HALF), align: 'left',  chipOffset: { x: 0, y: 0 }, delay: 0.05 },
  { id: 'metric',      pos: new THREE.Vector3( CUBE_HALF, -CUBE_HALF, -CUBE_HALF), align: 'right', chipOffset: { x: 0, y: 0 }, delay: 0.10 },
  { id: 'status',      pos: new THREE.Vector3(-CUBE_HALF, -CUBE_HALF, -CUBE_HALF), align: 'left',  chipOffset: { x: 0, y: 0 }, delay: 0.15 },
]

export function getDesignation(product: Product): string {
  const name = product.name

  if (name.toLowerCase().includes('bangalore')) {
    if (name.includes('4 x 6')) return 'BANGALORE 4×6FT'
    if (name.includes('8 x 1')) return 'BANGALORE 8×1M'
  }

  const allCapsWords = name
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w))
  if (allCapsWords.length > 0) {
    const joined = allCapsWords.join(' ')
    if (joined.length <= 18) return joined
    return allCapsWords[allCapsWords.length - 1]
  }

  const caliberMatch = name.match(/(\d+(?:\.\d+)?\s*mm)/i)
  if (caliberMatch) {
    const caliber = caliberMatch[1].toUpperCase().replace(/\s+/g, '')
    const afterCaliber = name
      .substring(caliberMatch.index! + caliberMatch[0].length)
      .trim()
    const typeWord = afterCaliber.match(/^[A-Z][A-Z0-9-]*/)?.[0]
    return typeWord ? `${caliber} ${typeWord}` : caliber
  }

  if (name.length <= 18) return name.toUpperCase()
  return name.substring(0, 16).toUpperCase().trim() + '…'
}

function endsOnFunctionWord(s: string): boolean {
  const lastWord = s.split(/\s+/).pop()?.toLowerCase() || ''
  return [
    'of', 'the', 'a', 'an', 'with', 'for', 'in', 'to', 'from', 'by', 'and', 'or', 'is',
  ].includes(lastWord)
}

export function getSubtitle(product: Product): string {
  const candidates = [
    product.specs['Main filling'],
    product.specs['Body material'],
    product.specs['Caliber'],
    product.specs['Caliber (mm)'],
    product.specs['Type'],
    product.specs['Bullet type'],
    product.specs['Case material'],
  ]
  const raw = candidates.find((v) => v && v.trim().length > 0)
  if (!raw) return '—'
  if (raw.length <= 40 && !endsOnFunctionWord(raw)) return raw

  const beforeColon = raw.split(':')[0].trim()
  if (beforeColon.length <= 40 && !endsOnFunctionWord(beforeColon)) {
    return beforeColon
  }

  const beforePrep = raw.split(/\s+(of|with|for|in|to|from|by)\s+/i)[0].trim()
  if (beforePrep.length <= 40 && !endsOnFunctionWord(beforePrep)) {
    return beforePrep
  }

  const words = raw.split(/\s+/)
  if (words[0].length >= 3) return words[0]
  return raw.substring(0, 38).trim() + '…'
}

export function getSubtype(product: Product): string {
  const name = product.name.toUpperCase()

  if (name.startsWith('DEMOLITION CHARGE')) return 'DEMOLITION'
  if (name.startsWith('SHAPED CHARGE')) return 'SHAPED CHARGE'
  if (name.includes('BANGALORE')) return 'LINE CHARGE'
  if (name.startsWith('BLACK DOUGH')) return 'PLASTIC EXPLOSIVE'
  if (name.startsWith('MORTAR ROUND')) return 'MORTAR'
  if (name.startsWith('ROCKET')) return 'ROCKET'
  if (name.startsWith('PROJECTILE')) return 'PROJECTILE'
  if (name.startsWith('PROPELLING CHARGE')) return 'PROPELLING'
  if (name.startsWith('ROUND PG-7') || name.startsWith('ROUND TB-7')) return 'RPG ROUND'
  if (name.startsWith('ROUND')) return 'ROUND'
  if (name.startsWith('SCORPIO')) {
    if (name.includes('LUGER') || name.includes('9 ×') || name.includes('9MM')) {
      return 'PISTOL'
    }
    return 'RIFLE'
  }

  return product.name.split(' ')[0].toUpperCase()
}

const NBSP = String.fromCharCode(0xa0)

/**
 * Glue the last two words with a non-breaking space so a product name never
 * wraps a single trailing character/word onto its own line (e.g. the lone "M"
 * in "BANGALORE TORPEDO 8 X 1 M").
 */
export function preventOrphan(s: string): string {
  return s.replace(/\s+(\S+)\s*$/, (_m, last: string) => NBSP + last)
}

export function formatDescription(description: string | null): string {
  if (!description) return ''
  if (description.length <= 500) return description
  const truncated = description.substring(0, 500)
  const lastPeriod = truncated.lastIndexOf('. ')
  if (lastPeriod > 100) return truncated.substring(0, lastPeriod + 1)
  return truncated.trim() + ' …'
}

export function pickChipValues(
  p: Product,
): { id: string; label: string; value: string }[] {
  const designation = getDesignation(p)
  const type = getSubtype(p)

  const metricCandidates: Array<[string, string]> = [
    ['NEQ',           'NEQ (kg)'],
    ['NEQ',           'NEQ (kg);'],
    ['CHARGE',        'Charge weight (kg)'],
    ['MAIN FILLING',  'Main filling weight (kg)'],
    ['WEIGHT',        'Torpedo weight (kg)'],
    ['WEIGHT',        'Weight (g)'],
    ['DET. VELOCITY', 'Detonation velocity (m/s)'],
    ['DET. VELOCITY', 'Detonation velocity'],
  ]
  let metricLabel = 'COMPOSITION'
  let metricValue = p.specs['Main filling'] ?? '—'
  for (const [lbl, key] of metricCandidates) {
    if (p.specs[key]) {
      metricLabel = lbl
      metricValue = p.specs[key]
      break
    }
  }

  return [
    { id: 'designation', label: 'DESIGNATION', value: designation },
    { id: 'type',        label: 'TYPE',        value: type },
    { id: 'metric',      label: metricLabel,   value: String(metricValue).slice(0, 22) },
    { id: 'status',      label: 'STATUS',      value: 'OPERATIONAL' },
  ]
}
