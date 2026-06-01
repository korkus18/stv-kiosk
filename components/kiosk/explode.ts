import * as THREE from 'three'
import type { ExplodeConfig } from '@/data/products'

/**
 * Code-driven "exploded view": find a model's separable top-level parts and
 * compute per-part offset vectors purely from geometry (no hand-authored
 * numbers). Offsets live on the PARTS (children); model rotation lives on the
 * root group, so the two compose natively — an exploded model still spins.
 */

export type ExplodePart = {
  obj: THREE.Object3D
  rest: THREE.Vector3 // assembled local position
  center: THREE.Vector3 // assembled geometry centre (parent-local) — for part labels
  offset: THREE.Vector3 // local translation when fully exploded
  stagger: number // 0 = moves first (inner), →STAGGER_MAX = last (outer)
}

export type ExplodeState = {
  parts: ExplodePart[]
}

const DEFAULT_DISTANCE = 0.6
const STAGGER_MAX = 0.28
/** Uniform shrink of the root group at full explode, to keep it in frame. */
export const EXPLODE_FIT_SCALE = 0.74

function hasMesh(o: THREE.Object3D): boolean {
  let found = false
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) found = true
  })
  return found
}

/** Local-space centre of a part (reads real geometry, robust to CAD exports
 *  that bake position into vertices and leave node transforms at identity). */
function localCenter(part: THREE.Object3D, parent: THREE.Object3D): THREE.Vector3 {
  const world = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3())
  return parent.worldToLocal(world)
}

/**
 * Collect the separable parts: descend through single mesh-bearing wrappers
 * (the exporter's `active`/`lux_root`/`New Model Set` containers) until a level
 * with ≥2 mesh-bearing siblings. Returns null if the model is effectively one
 * fused piece (<2 parts) — caller then hides the button.
 */
export function prepareExplode(
  scene: THREE.Object3D,
  config?: ExplodeConfig,
): ExplodeState | null {
  scene.updateMatrixWorld(true)

  let level = scene.children.filter(hasMesh)
  while (level.length === 1) {
    const kids = level[0].children.filter(hasMesh)
    if (kids.length === 0) break
    level = kids
  }
  if (level.length < 2) return null

  const parent = level[0].parent ?? scene
  const centers = level.map((p) => localCenter(p, parent))
  const modelCenter = centers
    .reduce((a, c) => a.add(c), new THREE.Vector3())
    .multiplyScalar(1 / centers.length)

  const mode = config?.mode ?? 'axial'
  const distance = config?.distance ?? DEFAULT_DISTANCE

  // Dominant axis = largest spread of part centres (or explicit override).
  let axis = new THREE.Vector3(1, 0, 0)
  if (config?.axisOverride) {
    axis = new THREE.Vector3(
      config.axisOverride === 'x' ? 1 : 0,
      config.axisOverride === 'y' ? 1 : 0,
      config.axisOverride === 'z' ? 1 : 0,
    )
  } else {
    const spread = ['x', 'y', 'z'].map((k) => {
      const vals = centers.map((c) => c[k as 'x' | 'y' | 'z'])
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      return vals.reduce((a, v) => a + (v - mean) ** 2, 0)
    })
    const dom = spread.indexOf(Math.max(...spread))
    axis = new THREE.Vector3(dom === 0 ? 1 : 0, dom === 1 ? 1 : 0, dom === 2 ? 1 : 0)
  }

  const maxDist =
    Math.max(...centers.map((c) => c.distanceTo(modelCenter))) || 1

  const parts: ExplodePart[] = level.map((obj, i) => {
    const center = centers[i]
    const radial = center.clone().sub(modelCenter)
    let offset: THREE.Vector3
    const override = config?.partOverrides?.[obj.name]
    if (override) {
      offset = new THREE.Vector3(override[0], override[1], override[2])
    } else if (mode === 'radial') {
      offset = radial.clone().multiplyScalar(distance)
    } else {
      // axial: move only along the dominant axis, proportional to position
      const along = radial.dot(axis)
      offset = axis.clone().multiplyScalar(along * distance)
    }
    return {
      obj,
      rest: obj.position.clone(),
      center: center.clone(),
      offset,
      stagger: (center.distanceTo(modelCenter) / maxDist) * STAGGER_MAX,
    }
  })

  return { parts }
}

/** Eased, staggered 0..1 progress for a single part. */
export function partProgress(global: number, stagger: number): number {
  const span = 1 - STAGGER_MAX
  const t = Math.min(1, Math.max(0, (global - stagger) / span))
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}
