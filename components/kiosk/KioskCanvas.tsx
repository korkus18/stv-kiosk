'use client'

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  OrbitControls,
  ContactShadows,
  useGLTF,
} from '@react-three/drei'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import type { GLTFLoader } from 'three-stdlib'
import type { AnchorState } from './HudChip'
import type { CubeState } from './HudCube'
import { LoadingSkeleton, LoadSignal } from './LoadingSkeleton'
import {
  prepareExplode,
  partProgress,
  EXPLODE_FIT_SCALE,
  type ExplodeState,
} from './explode'
import type { ExplodeField } from '@/data/products'

const HAYRICK_GLTF_PATH = '/models/hayrick/Hayrick.gltf'

function makeGltfLoaderExtender() {
  return (loader: GLTFLoader) => {
    const manager = new THREE.LoadingManager()
    manager.setURLModifier((url) => {
      if (url.includes('/models/') && url.includes('#')) {
        const slashIdx = url.lastIndexOf('/')
        const base = url.slice(slashIdx + 1)
        return url.slice(0, slashIdx + 1) + base.replace(/#/g, '%23')
      }
      return url
    })
    loader.manager = manager
  }
}

/** Shared loader config (handles `#` in resource paths). Exported so the
 *  attract loop can preload/clear under the SAME cache key. */
export const gltfLoaderExtender = makeGltfLoaderExtender()

if (typeof window !== 'undefined') {
  useGLTF.preload(HAYRICK_GLTF_PATH, undefined, undefined, gltfLoaderExtender)
}

export interface HudAnchor {
  id: string
  anchorPos: THREE.Vector3
  label: string
  value: string
  align: 'left' | 'right'
  delay: number
  chipOffset: { x: number; y: number }
}

interface KioskCanvasProps {
  anchors: HudAnchor[]
  anchorStateRef: React.MutableRefObject<Record<string, AnchorState>>
  /** Screen-space state of the cube wireframe + leaders (per chip), per frame. */
  cubeStateRef: React.MutableRefObject<Record<string, CubeState>>
  modelUrl?: string
  /** Portrait: no sidebar offset, slightly tighter framing.
   *  Landscape (default): existing recipe with view-offset for right-side
   *  info panel + left-side inventory sidebar. */
  orientation?: 'landscape' | 'portrait'
  /** Attract: pull the camera in and centre the model (no info-panel offset). */
  attract?: boolean
  /** Reports a model url that failed to load, so the loop can skip it. */
  onModelError?: (url: string) => void
  /** Next model the attract loop will show — prefetched for a seamless swap. */
  prefetchUrl?: string
  /** @deprecated No longer gates anything — every attract model now does the
   *  360° turn (+ explode if explodable). Kept for back-compat with callers. */
  attractExplode?: boolean
  /** Attract: current model's on-screen sequence (load → 360° flourish → dwell)
   *  finished — the loop should crossfade to the next model. */
  onAttractAdvance?: () => void
  /** Default model rest pose (Euler degrees [x,y,z]); absent = auto. */
  modelRotation?: [number, number, number]
  /** Exploded-view: toggle state, per-model config, and capability report. */
  exploded?: boolean
  explodeConfig?: ExplodeField
  onExplodableChange?: (explodable: boolean) => void
}

/** Crossfade halves — model dissolves out to the bg, swaps, dissolves in. */
const CROSSFADE_HALF_MS = 420
/** Max GLTFs kept in drei's cache at once — bounds memory on a 24/7 kiosk. */
const MODEL_CACHE_CAP = 4
/** attract↔active camera settle duration (seconds). */
const TRANSITION_S = 0.7
/** Landscape active framing nudges the model left for the right info panel. */
const ACTIVE_VIEW_OFFSET = 0.18

/** Slow continuous auto-rotate (rad/s) — attract AND active detail view. */
const IDLE_SPIN = 0.08
/** attract→active reveal flourish duration (ms): explode-out + 360° + reassemble. */
const FLOURISH_MS = 1300
/** Peak flourish spin (rad/s), tuned so the bell integrates to ~one full turn. */
const FLOURISH_SPIN_PEAK = (Math.PI * Math.PI) / (FLOURISH_MS / 1000)
/** Active: idle this long (ms) after an interaction before auto-rotate resumes. */
const RESUME_DELAY_MS = 2800
/** Ignore interaction this long after a flourish starts (the activating tap). */
const FLOURISH_GRACE_MS = 320

/** Attract lifecycle — each model plays a continuous, fade-free loop:
 *    1. ASSEMBLE — model arrives fully exploded; its parts fly together into the
 *       assembled shape (reverse explode).
 *    2. SPIN — assembled, it turns exactly one full 360° (sin(πt) bell → 2π).
 *    3. DISASSEMBLE — parts fly back apart; this IS the exit (no crossfade) —
 *       at full explode the model swaps and the next one assembles in.
 *  All three run off one clock (attractFlourishStart); GltfModel reads the
 *  explode phase, ModelMotion reads the spin window. Non-explodable models have
 *  no parts, so they just hold + do the 360° turn. */
const ATTRACT_ASSEMBLE_MS = 950
const ATTRACT_SPIN_MS = 2600
const ATTRACT_DISASSEMBLE_MS = 950
const ATTRACT_LIFECYCLE_MS =
  ATTRACT_ASSEMBLE_MS + ATTRACT_SPIN_MS + ATTRACT_DISASSEMBLE_MS
/** Peak spin (rad/s) of the 360° turn. A sin(πt) bell over the spin window
 *  integrates to exactly 2π → precisely one full turn, accelerating in and
 *  easing out. */
const ATTRACT_SPIN_PEAK = (Math.PI * Math.PI) / (ATTRACT_SPIN_MS / 1000)
/** Safety: advance even if a model never reports ready (hung/slow/broken load),
 *  so the loop can never stall waiting on one model. */
const ATTRACT_WATCHDOG_MS = 12000

/**
 * Shared, mutable motion state for the reveal flourish + active auto-rotate.
 * Lives in a ref (no re-renders); read each frame by ModelMotion (rotation) and
 * GltfModel (explode), so the two stay on one timeline without coupling.
 */
type MotionState = {
  flourishActive: boolean
  flourishStart: number // performance.now() at flourish start
  aborted: boolean // user interacted mid-flourish → bail to assembled
  lastInteract: number // performance.now() of last drag/zoom (active pause)
  attractFlourishActive: boolean // attract idle explode→hold→reassemble running
  attractFlourishStart: number // performance.now() at attract flourish start
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/** The bits of three's OrbitControls we drive imperatively. */
interface OrbitControlsLike {
  object: THREE.PerspectiveCamera
  target: THREE.Vector3
  minDistance: number
  maxDistance: number
  enabled: boolean
  update: () => void
  saveState: () => void
  reset: () => void
  addEventListener: (e: string, cb: () => void) => void
  removeEventListener: (e: string, cb: () => void) => void
}

const TARGET_MAX_DIM = 0.88
// Fraction of the frame the model's bounding sphere fills at the full (active)
// fit — lower = camera pushed back = model occupies less of the screen. Applies
// uniformly to every model in BOTH modes (attract scales this by ATTRACT_FIT).
const FRAME_FILL = 0.62
// Attract framing relative to the full active fit (<1 = closer/bigger). Tighter
// than active so the lone model dominates the frame (magnet from a distance);
// the aspect-aware fit keeps it fully visible with margin in both orientations.
const ATTRACT_FIT = 0.82
// Attract pushes the model up by this fraction of the viewport height, freeing
// the lower band for the "touch to explore" prompt (no overlap with the model).
const ATTRACT_Y_SHIFT = 0.1
const FIT_APPLIED = Symbol.for('stv.kioskCanvas.fitApplied')
/** Explode data cached on the scene — captured ONCE (assembled), so a later
 *  effect re-run never re-captures exploded positions as the "rest" pose. */
const EXPLODE_DATA = Symbol.for('stv.kioskCanvas.explodeData')

/** Models whose baked surface text is mirrored — flip Z to read correctly. */
const TEXT_MIRROR_FIX = ['round_152mm_he_full', 'projectile_155mm_he_m107']

// Session-scoped: the gesture hint shows only on the first activation per page
// load, then never again (survives canvas remounts + orientation changes).
let gestureHintConsumed = false

/**
 * Catches a failed model load (bad/missing/corrupt GLTF) so the canvas never
 * crashes. Reports the offending url once so the attract loop can skip it, and
 * renders nothing in its place (no broken/placeholder model on screen).
 */
class ModelErrorBoundary extends Component<
  { url: string; onError?: (url: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError?.(this.props.url)
  }
  componentDidUpdate(prev: { url: string }) {
    // New url to try → reset so the boundary can render the next model.
    if (prev.url !== this.props.url && this.state.failed) {
      this.setState({ failed: false })
    }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Scale every mesh material's opacity to `k` (0..1) relative to its stashed
 *  original (captured on first call), toggling `transparent` as needed. Drives
 *  the attract dissolve so model swaps land while fully invisible. */
function setModelOpacity(scene: THREE.Object3D, k: number) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (!mat) continue
      const rec = mat as THREE.Material & {
        __origOpacity?: number
        __origTransparent?: boolean
      }
      if (rec.__origOpacity === undefined) {
        rec.__origOpacity = rec.opacity
        rec.__origTransparent = rec.transparent
      }
      rec.opacity = rec.__origOpacity * k
      rec.transparent = k < 0.999 ? true : rec.__origTransparent ?? false
    }
  })
}

function GltfModel({
  url,
  fitZRef,
  modelGroupRef,
  attract = false,
  exploded = false,
  explodeConfig,
  onExplodableChange,
  motionRef,
  modelRotation,
  calibrate = false,
  onCalibrateChange,
}: {
  url: string
  fitZRef: React.MutableRefObject<number>
  modelGroupRef: React.RefObject<THREE.Group | null>
  /** Attract: the model arrives fully exploded and assembles in (no fade). */
  attract?: boolean
  exploded?: boolean
  explodeConfig?: ExplodeField
  onExplodableChange?: (explodable: boolean) => void
  motionRef: React.MutableRefObject<MotionState>
  /** Default rest pose (Euler degrees [x,y,z]); absent = auto. */
  modelRotation?: [number, number, number]
  /** Dev calibrator: freeze + let the user orient the model to read off values. */
  calibrate?: boolean
  onCalibrateChange?: (deg: [number, number, number]) => void
}) {
  const { scene } = useGLTF(url, undefined, undefined, gltfLoaderExtender)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const explodeRef = useRef<ExplodeState | null>(null)
  const progressRef = useRef(0)
  /** Resolved rest pose (degrees) actually applied — auto heuristic or override. */
  const autoDegRef = useRef<[number, number, number]>([0, 0, 0])
  const baseDegRef = useRef<[number, number, number]>([0, 0, 0])
  const calibrateRef = useRef(calibrate)
  calibrateRef.current = calibrate
  /** Materialise fade-in (0→1) on each mount — pairs with the loading skeleton's
   *  dissolve so the real model fades in instead of popping. */
  const materializeRef = useRef(0)
  const explodedRef = useRef(exploded)
  explodedRef.current = exploded
  const attractRef = useRef(attract)
  attractRef.current = attract
  /** True while the attract opacity fade is driving the materials, so we know to
   *  restore full opacity exactly once when the lifecycle ends (e.g. on tap). */
  const attractFadeRef = useRef(false)
  const controls = useThree((s) => s.controls) as unknown as {
    minDistance: number
    maxDistance: number
  } | null

  // Apply a rest pose (Euler degrees) to the model and RE-CENTRE on the rotated
  // bounding box, so any orientation stays dead-centre (the spin rides on top).
  // Neutralises the group spin for the measurement, like the fit pass does.
  const applyPose = useCallback(
    (deg: [number, number, number]) => {
      const group = modelGroupRef.current
      const saved = group ? group.rotation.clone() : null
      if (group) {
        group.rotation.set(0, 0, 0)
        group.updateMatrixWorld(true)
      }
      scene.position.set(0, 0, 0)
      scene.rotation.set(
        THREE.MathUtils.degToRad(deg[0]),
        THREE.MathUtils.degToRad(deg[1]),
        THREE.MathUtils.degToRad(deg[2]),
      )
      scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(scene)
      scene.position.sub(box.getCenter(new THREE.Vector3()))
      scene.updateMatrixWorld(true)
      if (group && saved) {
        group.rotation.copy(saved)
        group.updateMatrixWorld(true)
      }
    },
    [scene, modelGroupRef],
  )

  useEffect(() => {
    // Box measurements below use setFromObject → WORLD space, which folds in the
    // modelGroup's live auto-spin. Neutralise that spin for the whole measurement
    // pass so normalisation (scale + centring) and the camera fit are computed in
    // the group's own frame — spin-independent. Without this, whatever angle the
    // group happened to be at when a model loaded skewed its size AND centre (the
    // model then orbited off-centre as it spun). Restored at the end; no render
    // happens in between, so it's invisible.
    const group = modelGroupRef.current
    const savedRot = group ? group.rotation.clone() : null
    if (group) {
      group.rotation.set(0, 0, 0)
      group.updateMatrixWorld(true)
    }

    const flagged = (scene as unknown as Record<symbol, boolean>)[FIT_APPLIED]

    if (!flagged) {
      ;(scene as unknown as Record<symbol, boolean>)[FIT_APPLIED] = true

      const rawBox = new THREE.Box3().setFromObject(scene)
      const rawSize = rawBox.getSize(new THREE.Vector3())
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1
      const fitScale = TARGET_MAX_DIM / maxDim

      scene.scale.setScalar(fitScale)

      // Text-mirror fix: a few assets came out of STEP→glTF with their surface
      // text mirrored (reads backwards) — NOT a transform mirror (verified: no
      // negative scale anywhere), it's baked in. These are axisymmetric shells,
      // so flipping the Z axis (perpendicular to each one's symmetry axis)
      // un-mirrors the text and leaves the shape identical. THREE auto-corrects
      // the face winding for the negative determinant.
      if (TEXT_MIRROR_FIX.some((frag) => url.includes(frag))) {
        scene.scale.z = -fitScale
      }

      // Auto presentation pose — long cylindrical objects (Bangalore et al.) get
      // a tilt for 3D presence rather than a flat horizontal line; threshold > 5
      // keeps Hayrick / chunkier shapes upright. This is just the DEFAULT pose; a
      // per-model `modelRotation` overrides it (see applyPose below). Centring
      // happens in applyPose (re-centres on the rotated box → always dead-centre).
      const dims = [rawSize.x, rawSize.y, rawSize.z].sort((a, b) => b - a)
      const aspectRatio = dims[0] / Math.max(dims[1], 0.001)
      autoDegRef.current =
        aspectRatio > 5 ? [11.25, 180 / 7, -22.5] : [0, 0, 0]

      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.castShadow = true
          m.receiveShadow = true
          const mat = m.material as THREE.Material | THREE.Material[] | undefined
          const dim = (x: THREE.Material) => {
            if ('envMapIntensity' in x) {
              ;(x as THREE.MeshPhysicalMaterial).envMapIntensity = 0.7
            }
          }
          if (Array.isArray(mat)) mat.forEach(dim)
          else if (mat) dim(mat)
        }
      })
    }

    // Resolve + apply the rest pose every run (so a changed `modelRotation`
    // re-poses without a reload), unless the live calibrator owns the pose.
    const baseDeg = modelRotation ?? autoDegRef.current
    baseDegRef.current = baseDeg
    if (!calibrateRef.current) applyPose(baseDeg)

    scene.updateMatrixWorld(true)
    const finalBox = new THREE.Box3().setFromObject(scene)
    // Frame on the BOUNDING SPHERE (3D diagonal) — rotation-invariant, so every
    // model fills the frame to the same envelope regardless of shape or spin
    // angle → consistent apparent size, never clips. (The real "different sizes"
    // bug was the spin-corrupted measurement above, now neutralised; this stays a
    // plain, uniform sphere fit.)
    const diag = finalBox.getSize(new THREE.Vector3()).length()

    const persp = camera as THREE.PerspectiveCamera
    const fov = persp.fov ?? 30

    // Aspect-aware: fit the sphere to BOTH FOV axes (margin via FRAME_FILL) and take the
    // farther distance. Landscape → vertical term wins; narrow portrait → the
    // horizontal term wins, so wide/long models don't overflow the side edges.
    const vHalf = (fov * Math.PI) / 360
    const aspect = size.width / Math.max(size.height, 1)
    const hHalf = Math.atan(Math.tan(vHalf) * aspect)
    const fitV = diag / (2 * Math.tan(vHalf) * FRAME_FILL)
    const fitH = diag / (2 * Math.tan(hHalf) * FRAME_FILL)
    const fitZ = Math.max(fitV, fitH)

    persp.near = Math.max(fitZ / 1000, 0.01)
    persp.far = fitZ * 100
    persp.updateProjectionMatrix()

    if (controls) {
      controls.minDistance = fitZ * 0.3
      controls.maxDistance = fitZ * 4
    }

    // Hand the full-fit distance to CameraDirector, which owns camera position
    // + the attract/active framing transitions.
    fitZRef.current = fitZ

    // Prepare exploded-view parts ONCE per scene (cached), capturing rest poses
    // while the model is assembled. Re-running this effect must NOT re-capture
    // mid-flourish (exploded) positions as "rest".
    const cache = scene as unknown as Record<symbol, ExplodeState | null>
    if (!(EXPLODE_DATA in cache)) {
      cache[EXPLODE_DATA] =
        explodeConfig === false
          ? null
          : prepareExplode(
              scene,
              typeof explodeConfig === 'object' ? explodeConfig : undefined,
            )
    }
    const state = cache[EXPLODE_DATA]
    explodeRef.current = state
    // Attract: an explodable model arrives FULLY EXPLODED (progress 1) so its
    // parts can fly together (assemble-in). Active (and non-explodable attract)
    // start assembled.
    const attractAssembleIn = attractRef.current && state !== null
    progressRef.current = attractAssembleIn ? 1 : 0
    onExplodableChange?.(state !== null)

    // Start every (re)mount fully transparent (stashing each material's original
    // opacity/transparent once). Who ramps it back: in ATTRACT, the attract fade
    // owns opacity for EVERY model (explodable or not) so it tracks the lifecycle
    // and swaps land invisibly; in ACTIVE, the materialise fade-in (~0.45 s).
    materializeRef.current = attractRef.current ? 1 : 0
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        if (!mat) continue
        const rec = mat as THREE.Material & {
          __origOpacity?: number
          __origTransparent?: boolean
        }
        if (rec.__origOpacity === undefined) {
          rec.__origOpacity = rec.opacity
          rec.__origTransparent = rec.transparent
        }
        rec.transparent = true
        rec.opacity = 0
      }
    })

    // Restore the live auto-spin we neutralised for measurement.
    if (group && savedRot) {
      group.rotation.copy(savedRot)
      group.updateMatrixWorld(true)
    }
  }, [
    scene,
    camera,
    controls,
    fitZRef,
    size.width,
    size.height,
    explodeConfig,
    onExplodableChange,
    modelRotation,
    applyPose,
  ])

  // Dev calibrator: freeze the model and let the user orient it (drag = yaw/pitch,
  // arrows/Q-E = nudge, R = reset), re-centring + reporting the live Euler degrees
  // so they can be copied into `modelRotation`. Exiting restores the saved pose.
  useEffect(() => {
    if (!calibrate) return
    let deg: [number, number, number] = [...baseDegRef.current] as [
      number,
      number,
      number,
    ]
    const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
    const push = () => {
      deg = [norm(deg[0]), norm(deg[1]), norm(deg[2])]
      applyPose(deg)
      onCalibrateChange?.([
        Math.round(deg[0]),
        Math.round(deg[1]),
        Math.round(deg[2]),
      ])
    }
    push()

    let lastX = 0
    let lastY = 0
    let dragging = false
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging || e.buttons === 0) return
      const k = e.shiftKey ? 0.15 : 0.5
      deg[1] += (e.clientX - lastX) * k
      deg[0] += (e.clientY - lastY) * k
      lastX = e.clientX
      lastY = e.clientY
      push()
    }
    const onUp = () => {
      dragging = false
    }
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 1 : 5
      if (e.key === 'ArrowLeft') deg[1] -= step
      else if (e.key === 'ArrowRight') deg[1] += step
      else if (e.key === 'ArrowUp') deg[0] -= step
      else if (e.key === 'ArrowDown') deg[0] += step
      else if (e.key === 'q' || e.key === 'Q') deg[2] -= step
      else if (e.key === 'e' || e.key === 'E') deg[2] += step
      else if (e.key === 'r' || e.key === 'R') deg = [0, 0, 0]
      else return
      e.preventDefault()
      push()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      // Restore the saved (products.json / auto) pose on exit.
      applyPose(baseDegRef.current)
    }
  }, [calibrate, applyPose, onCalibrateChange])

  // Animate parts (rest ↔ rest+offset) + shrink the root group so the exploded
  // model stays in frame. Composes with the root rotation, so it works mid-spin.
  // During the reveal flourish (explodable models only) the progress is scripted
  // out→in; otherwise it eases toward the user's explode toggle.
  useFrame((_, delta) => {
    const st = explodeRef.current
    const m = motionRef.current
    if (m.flourishActive && !m.aborted && st) {
      const t = Math.min(1, (performance.now() - m.flourishStart) / FLOURISH_MS)
      // out by 45%, brief hold, reassembled by 100%
      const target = t < 0.45 ? t / 0.45 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45
      progressRef.current +=
        (target - progressRef.current) * Math.min(1, delta * 12)
    } else if (m.attractFlourishActive && st) {
      // Attract lifecycle explode: assemble-in (parts fly together) → hold while
      // the 360° turn runs (ModelMotion) → disassemble-out (parts fly apart = the
      // exit). progress: 1 → 0 → 0 → 1. Eased target, gently smoothed.
      const e = performance.now() - m.attractFlourishStart
      let target: number
      if (e < ATTRACT_ASSEMBLE_MS) {
        target = 1 - easeInOut(e / ATTRACT_ASSEMBLE_MS)
      } else if (e < ATTRACT_ASSEMBLE_MS + ATTRACT_SPIN_MS) {
        target = 0
      } else {
        const a =
          (e - ATTRACT_ASSEMBLE_MS - ATTRACT_SPIN_MS) / ATTRACT_DISASSEMBLE_MS
        target = easeInOut(Math.min(1, a))
      }
      progressRef.current +=
        (target - progressRef.current) * Math.min(1, delta * 10)
    } else {
      const target = explodedRef.current ? 1 : 0
      progressRef.current +=
        (target - progressRef.current) * Math.min(1, delta * 6)
    }
    const g = progressRef.current
    if (st) {
      for (const part of st.parts) {
        const t = partProgress(g, part.stagger)
        part.obj.position.set(
          part.rest.x + part.offset.x * t,
          part.rest.y + part.offset.y * t,
          part.rest.z + part.offset.z * t,
        )
      }
    }
    if (modelGroupRef.current) {
      modelGroupRef.current.scale.setScalar(1 + (EXPLODE_FIT_SCALE - 1) * g)
    }

    // Materialise fade-in (hands off from the loading skeleton).
    if (materializeRef.current < 1) {
      materializeRef.current = Math.min(1, materializeRef.current + delta / 0.45)
      const mp = materializeRef.current
      const done = mp >= 1
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          const rec = mat as THREE.Material & {
            __origOpacity?: number
            __origTransparent?: boolean
          }
          if (rec.__origOpacity === undefined) continue
          rec.opacity = rec.__origOpacity * mp
          if (done) {
            rec.transparent = rec.__origTransparent ?? false
            rec.opacity = rec.__origOpacity
          }
        }
      })
    }

    // Attract opacity fade — tie material opacity to the assemble/disassemble so
    // model swaps happen while invisible (opacity 0), softening the hand-off into
    // a smooth dissolve rather than a hard cut. Fades IN over the first part of
    // assemble, holds opaque through the spin, fades OUT over the last part of
    // disassemble. On lifecycle end (e.g. user taps → reveal flourish) opacity is
    // restored to each material's original exactly once.
    const inAttractFade = attractRef.current && m.attractFlourishActive
    if (inAttractFade) {
      const e = performance.now() - m.attractFlourishStart
      let k: number
      if (e < ATTRACT_ASSEMBLE_MS) {
        k = Math.min(1, e / (ATTRACT_ASSEMBLE_MS * 0.6))
      } else if (e < ATTRACT_ASSEMBLE_MS + ATTRACT_SPIN_MS) {
        k = 1
      } else {
        const d = (e - ATTRACT_ASSEMBLE_MS - ATTRACT_SPIN_MS) / ATTRACT_DISASSEMBLE_MS
        k = 1 - Math.min(1, Math.max(0, (d - 0.4) / 0.6))
      }
      setModelOpacity(scene, k)
      attractFadeRef.current = true
    } else if (attractFadeRef.current && !attractRef.current) {
      // Left attract entirely (user tapped → active): restore full opacity once.
      // At a NORMAL cycle end attract stays true and the model swaps while still
      // invisible, so we deliberately leave opacity near 0 (no pre-swap flash).
      setModelOpacity(scene, 1)
      attractFadeRef.current = false
    }
  })

  return <primitive object={scene} />
}

/**
 * Owns camera framing so attract↔active is a smooth single motion rather than a
 * snap. Targets a front view at `fitZ * (attract ? ATTRACT_FIT : 1)` plus the
 * landscape active view-offset, and eases toward it (TRANSITION_S) whenever the
 * target changes — model swap or attract/active flip. While easing, OrbitControls
 * stays disabled; once settled in active it saves that framing (for reset-view)
 * and re-enables user control. In steady active state it doesn't touch the
 * camera, so the visitor's own rotate/zoom persists.
 */
function CameraDirector({
  attract,
  orientation,
  fitZRef,
  onControlsEnabledChange,
}: {
  attract: boolean
  orientation: 'landscape' | 'portrait'
  fitZRef: React.MutableRefObject<number>
  onControlsEnabledChange: (enabled: boolean) => void
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null

  const applied = useRef({ fitZ: 0, attract })
  const transitioning = useRef(false)
  const progress = useRef(1)
  const startZ = useRef(0)
  const startXPct = useRef(0)
  const startYPct = useRef(0)
  const curXPct = useRef(0)
  const curYPct = useRef(0)

  // Horizontal: landscape active nudges left for the info panel. Vertical:
  // attract lifts the model up to clear the bottom band for the prompt.
  const targetXPct = (a: boolean) =>
    orientation === 'portrait' || a ? 0 : ACTIVE_VIEW_OFFSET
  const targetYPct = (a: boolean) => (a ? ATTRACT_Y_SHIFT : 0)

  const applyOffset = (
    persp: THREE.PerspectiveCamera,
    xPct: number,
    yPct: number,
  ) => {
    curXPct.current = xPct
    curYPct.current = yPct
    if (Math.abs(xPct) <= 0.0001 && Math.abs(yPct) <= 0.0001) {
      persp.clearViewOffset()
    } else {
      persp.setViewOffset(
        size.width,
        size.height,
        xPct * size.width,
        yPct * size.height,
        size.width,
        size.height,
      )
    }
  }

  useFrame((_, delta) => {
    const fitZ = fitZRef.current
    if (!fitZ) return
    const persp = camera as THREE.PerspectiveCamera

    // Target changed (first model, model swap, or attract flip)?
    if (fitZ !== applied.current.fitZ || attract !== applied.current.attract) {
      const first = applied.current.fitZ === 0
      applied.current = { fitZ, attract }
      startZ.current = persp.position.z
      startXPct.current = curXPct.current
      startYPct.current = curYPct.current

      if (first) {
        // No opening animation — snap straight to the initial framing.
        progress.current = 1
        transitioning.current = false
        persp.position.set(0, 0, fitZ * (attract ? ATTRACT_FIT : 1))
        if (controls) {
          controls.target.set(0, 0, 0)
          controls.update()
        }
        applyOffset(persp, targetXPct(attract), targetYPct(attract))
        if (!attract && controls) controls.saveState()
        onControlsEnabledChange(!attract)
        return
      }

      progress.current = 0
      transitioning.current = true
      onControlsEnabledChange(false)
    }

    if (!transitioning.current) return

    progress.current = Math.min(1, progress.current + delta / TRANSITION_S)
    const p = easeInOut(progress.current)
    const targetZ = fitZ * (attract ? ATTRACT_FIT : 1)
    persp.position.set(0, 0, startZ.current + (targetZ - startZ.current) * p)
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
    applyOffset(
      persp,
      startXPct.current + (targetXPct(attract) - startXPct.current) * p,
      startYPct.current + (targetYPct(attract) - startYPct.current) * p,
    )

    if (progress.current >= 1) {
      transitioning.current = false
      if (!attract) {
        if (controls) controls.saveState()
        onControlsEnabledChange(true)
      }
    }
  })

  return null
}

/** Leader-pin sits at this fraction along the corner direction (≈ model surface). */
const PIN_RADIUS = 0.42
/** Cube-edge stub length, as a fraction of a full cube edge (corner → neighbour). */
const EDGE_FRAC = 0.32
/** Back-face fade band for the leader occlusion (facing = normal·viewDir). */
const PIN_FADE_BAND = 0.5
/** Per-frame smoothing of leader strength so occlusion fades, never snaps. */
const PIN_DAMP = 0.18
/** How much the imaginary cube grows at full explode (fraction of its size), so
 *  it keeps wrapping the model as the parts spread out. Derived from the model
 *  group's live scale (explode shrinks the group to EXPLODE_FIT_SCALE), so the
 *  cube counter-scales AND grows on top — no extra explode plumbing needed. */
const EXPLODE_CUBE_GROW = 0.6

interface AnchorProjectorProps {
  anchors: HudAnchor[]
  modelGroupRef: React.RefObject<THREE.Group | null>
  anchorStateRef: React.MutableRefObject<Record<string, AnchorState>>
  cubeStateRef: React.MutableRefObject<Record<string, CubeState>>
}

/**
 * Projects everything that rides the imaginary cube through the model's FULL world
 * matrix (spin included), so it all rotates WITH the model:
 *   - the chip corner (→ anchorStateRef; HudChip is a DOM billboard, text upright)
 *   - 3 cube-edge stubs per corner (the "3 lines" that sketch the cube edges)
 *   - a leader pin on the model surface along the corner direction, with a cheap
 *     back-face occlusion fade (→ cubeStateRef, drawn by HudCube).
 */
function AnchorProjector({
  anchors,
  modelGroupRef,
  anchorStateRef,
  cubeStateRef,
}: AnchorProjectorProps) {
  const corner = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const pinWorld = useMemo(() => new THREE.Vector3(), [])
  const normalW = useMemo(() => new THREE.Vector3(), [])
  const viewDir = useMemo(() => new THREE.Vector3(), [])
  const mPos = useMemo(() => new THREE.Vector3(), [])
  const mQuat = useMemo(() => new THREE.Quaternion(), [])
  const mScale = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size }) => {
    const g = modelGroupRef.current
    if (!g) return
    g.matrixWorld.decompose(mPos, mQuat, mScale)
    const sx = (v: THREE.Vector3) => (v.x * 0.5 + 0.5) * size.width
    const sy = (v: THREE.Vector3) => (-v.y * 0.5 + 0.5) * size.height

    // Explode grow: the group scale shrinks 1 → EXPLODE_FIT_SCALE as the model
    // explodes, so recover the explode progress from it and scale the cube up by
    // (1 + GROW·progress) in WORLD terms (the / S cancels the group's shrink, so
    // the matrixWorld below lands the cube at anchorPos·(1 + GROW·progress)).
    const S = mScale.x || 1
    const explodeG = THREE.MathUtils.clamp(
      (1 - S) / (1 - EXPLODE_FIT_SCALE),
      0,
      1,
    )
    const cubeScale = (1 + EXPLODE_CUBE_GROW * explodeG) / S

    for (const anchor of anchors) {
      const id = anchor.id

      // Chip corner.
      corner.copy(anchor.anchorPos).multiplyScalar(cubeScale).applyMatrix4(g.matrixWorld).project(camera)
      const cx = sx(corner)
      const cy = sy(corner)
      anchorStateRef.current[id] = { x: cx, y: cy, visible: corner.z < 1, z: corner.z }

      // 3 cube-edge stubs: shorten the corner toward its neighbour along each axis.
      const stubs: { x: number; y: number }[] = []
      for (let a = 0; a < 3; a++) {
        tmp.copy(anchor.anchorPos)
        tmp.setComponent(a, tmp.getComponent(a) * (1 - 2 * EDGE_FRAC))
        tmp.multiplyScalar(cubeScale).applyMatrix4(g.matrixWorld).project(camera)
        stubs.push({ x: sx(tmp), y: sy(tmp) })
      }

      // Leader pin on the model surface + back-face occlusion.
      normalW.copy(anchor.anchorPos).normalize()
      pinWorld.copy(normalW).multiplyScalar(PIN_RADIUS * cubeScale).applyMatrix4(g.matrixWorld)
      normalW.applyQuaternion(mQuat)
      viewDir.copy(pinWorld).sub(camera.position).normalize()
      const facing = normalW.dot(viewDir)
      let strength = THREE.MathUtils.clamp(
        (PIN_FADE_BAND - facing) / (2 * PIN_FADE_BAND),
        0,
        1,
      )
      pinWorld.project(camera)
      if (pinWorld.z >= 1) strength = 0
      const prev = cubeStateRef.current[id]
      const smoothed = prev ? prev.strength + (strength - prev.strength) * PIN_DAMP : strength
      cubeStateRef.current[id] = {
        cx,
        cy,
        stubs,
        px: sx(pinWorld),
        py: sy(pinWorld),
        strength: smoothed,
      }
    }
  })

  return null
}

interface ModelMotionProps {
  modelGroupRef: React.RefObject<THREE.Group | null>
  attract: boolean
  motionRef: React.MutableRefObject<MotionState>
  /** Dev calibrator: freeze the spin at identity so the pose is WYSIWYG. */
  calibrate?: boolean
}

/**
 * Drives the root group's Y spin:
 *  - attract: slow continuous auto-rotate.
 *  - flourish (attract→active reveal): a fast ~360° bell-shaped spin.
 *  - active detail: slow auto-rotate, PAUSED while the visitor is interacting
 *    (drag/zoom), resuming after RESUME_DELAY_MS of stillness.
 * Explode is handled separately (GltfModel) on the same flourish clock.
 */
function ModelMotion({ modelGroupRef, attract, motionRef, calibrate }: ModelMotionProps) {
  const speed = useRef<number>(0)

  useFrame((_, delta) => {
    const g = modelGroupRef.current
    if (!g) return
    const m = motionRef.current
    const now = performance.now()

    if (calibrate) {
      // Freeze at identity so the calibrator's pose is shown exactly.
      g.rotation.set(0, 0, 0)
      speed.current = 0
      return
    }

    if (m.flourishActive && !m.aborted) {
      const t = Math.min(1, (now - m.flourishStart) / FLOURISH_MS)
      // bell: 0 → peak → 0, integrates to roughly one full turn; snappy (no lag)
      speed.current = FLOURISH_SPIN_PEAK * Math.sin(Math.PI * t)
      g.rotation.y += speed.current * delta
      return
    }

    if (m.attractFlourishActive) {
      // Attract lifecycle: spin ONLY during the middle window (assembled), and
      // there do exactly one 360° turn — a sin(πt) bell integrates to 2π. While
      // the parts fly together (assemble) / apart (disassemble) the model holds
      // still so the motion reads clearly.
      const e = now - m.attractFlourishStart
      const spinStart = ATTRACT_ASSEMBLE_MS
      const spinEnd = ATTRACT_ASSEMBLE_MS + ATTRACT_SPIN_MS
      if (e >= spinStart && e < spinEnd) {
        const t = (e - spinStart) / ATTRACT_SPIN_MS
        speed.current = ATTRACT_SPIN_PEAK * Math.sin(Math.PI * t)
        g.rotation.y += speed.current * delta
      } else {
        speed.current = 0
      }
      return
    }

    let target: number
    if (attract) {
      target = IDLE_SPIN
    } else {
      const idle = now - m.lastInteract > RESUME_DELAY_MS
      target = idle ? IDLE_SPIN : 0
    }
    speed.current += (target - speed.current) * 0.06
    g.rotation.y += speed.current * delta
  })

  return null
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.7} color="#ffffff" />
      <directionalLight
        position={[3, 5, 3]}
        intensity={1.3}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-3, 2, 1]} intensity={0.5} color="#f5f5f5" />
      <directionalLight position={[0, 3, -3]} intensity={0.4} color="#ffffff" />
    </>
  )
}

export function KioskCanvas({
  anchors,
  anchorStateRef,
  cubeStateRef,
  modelUrl = HAYRICK_GLTF_PATH,
  orientation = 'landscape',
  attract = false,
  onModelError,
  prefetchUrl,
  onAttractAdvance,
  modelRotation,
  exploded = false,
  explodeConfig,
  onExplodableChange,
}: KioskCanvasProps) {
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const orbitControlsRef = useRef<OrbitControlsLike | null>(null)
  // Seed a sensible framing distance so the loading skeleton is well-framed even
  // on the very first load (before any model has reported its real fit). Real
  // models overwrite this the moment they load.
  const fitZRef = useRef<number>(2.8)
  const motionRef = useRef<MotionState>({
    flourishActive: false,
    flourishStart: 0,
    aborted: false,
    lastInteract: 0,
    attractFlourishActive: false,
    attractFlourishStart: 0,
  })

  // Reveal flourish: when entering active, run the explode+360°+reassemble for
  // FLOURISH_MS, then hand off to continuous auto-rotate (lastInteract reset so
  // it spins immediately, not paused by the activating tap).
  const prevAttractRef = useRef(attract)
  useEffect(() => {
    const was = prevAttractRef.current
    prevAttractRef.current = attract
    const m = motionRef.current
    if (attract) {
      m.flourishActive = false
      return
    }
    if (was && !attract) {
      // A touch during attract (even mid idle-flourish) lands here: cleanly
      // stop the idle flourish and hand its explode progress to the active
      // reveal — same shared progressRef, so no double explode / conflict.
      m.attractFlourishActive = false
      m.flourishActive = true
      m.flourishStart = performance.now()
      m.aborted = false
      const t = setTimeout(() => {
        m.flourishActive = false
        m.lastInteract = 0
      }, FLOURISH_MS)
      return () => clearTimeout(t)
    }
  }, [attract])

  // Active interaction → pause auto-rotate (keeps lastInteract fresh through a
  // drag) and abort the flourish if it's still running. Hover (no buttons) is
  // ignored. The activating tap fired before this listener attaches in attract,
  // so it doesn't abort its own flourish.
  useEffect(() => {
    if (attract) return
    const onInteract = (e: Event) => {
      if (e.type === 'pointermove' && (e as PointerEvent).buttons === 0) return
      const m = motionRef.current
      const now = performance.now()
      // Ignore the activating tap's own events (fired right as the flourish
      // starts) so it doesn't instantly abort its own reveal.
      if (m.flourishActive && now - m.flourishStart < FLOURISH_GRACE_MS) return
      m.lastInteract = now
      if (m.flourishActive) {
        m.flourishActive = false
        m.aborted = true
      }
    }
    const evts = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel']
    for (const ev of evts) window.addEventListener(ev, onInteract, { passive: true })
    return () => {
      for (const ev of evts) window.removeEventListener(ev, onInteract)
    }
  }, [attract])

  // OrbitControls is enabled only once the active-mode settle finishes; attract
  // and the transition keep it off (the attract overlay also blocks input).
  const [controlsEnabled, setControlsEnabled] = useState(false)

  // True while the CURRENT model's GLTF is actually loading (drives the
  // materialisation skeleton). Toggled by a Suspense fallback signal, so cached
  // / prefetched models never flip it → no skeleton flash on attract swaps.
  const [modelLoading, setModelLoading] = useState(false)

  // Attract loop sequencing. `modelReady` flips true once the active model has
  // loaded + been measured (GltfModel reports explodable at the end of its fit
  // pass — the precise "loaded, not half-loaded" signal, tied to the loading
  // skeleton handoff). The advance callback is held in a ref so the sequence
  // effect doesn't restart when only it changes. (The `attractExplode` prop is
  // no longer read — every model now flourishes; kept on the interface for
  // back-compat.)
  const [modelReady, setModelReady] = useState(false)
  const onAttractAdvanceRef = useRef(onAttractAdvance)
  onAttractAdvanceRef.current = onAttractAdvance

  const handleExplodable = useCallback(
    (explodable: boolean) => {
      setModelReady(true)
      onExplodableChange?.(explodable)
    },
    [onExplodableChange],
  )

  // Dev-only model-orientation calibrator. Toggle with `c`; stripped from
  // production builds (NODE_ENV === 'production' → never attaches / renders).
  const calibrationEnabled = process.env.NODE_ENV !== 'production'
  const [calibrate, setCalibrate] = useState(false)
  const [calibDeg, setCalibDeg] = useState<[number, number, number]>([0, 0, 0])
  useEffect(() => {
    if (!calibrationEnabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') setCalibrate((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibrationEnabled])
  const calibrating = calibrationEnabled && calibrate

  // One-time "drag to rotate" hint — shows on the FIRST activation of the
  // session (module flag survives remounts/orientation changes) and never again.
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    if (attract || gestureHintConsumed) return
    gestureHintConsumed = true
    setShowHint(true)
    const t = setTimeout(() => setShowHint(false), 4500)
    return () => clearTimeout(t)
  }, [attract])
  // Dismiss on the first interaction (drag / pinch / tap anywhere on the scene).
  const hideHint = () => setShowHint(false)

  // Visible zoom controls (no rotate buttons — drag/pinch handle rotation).
  const dolly = (factor: number) => {
    const c = orbitControlsRef.current
    if (!c) return
    const dir = c.object.position.clone().sub(c.target)
    const dist = Math.min(
      Math.max(dir.length() * factor, c.minDistance),
      c.maxDistance,
    )
    c.object.position.copy(c.target).add(dir.setLength(dist))
    c.update()
  }
  const onZoomIn = () => dolly(0.82)
  const onZoomOut = () => dolly(1.22)
  const onResetView = () => orbitControlsRef.current?.reset()

  // Model swap. ACTIVE (user switching products): crossfade — fade out to bg,
  // swap while invisible (prefetched), fade back in. ATTRACT: NO fade — the swap
  // is hidden by the explode lifecycle (old model just disassembled to bits, new
  // one starts exploded and assembles in), so we swap instantly and stay opaque.
  // One WebGL context, no double-mount either way.
  const [activeUrl, setActiveUrl] = useState(modelUrl)
  const [opacity, setOpacity] = useState(1)
  useEffect(() => {
    if (modelUrl === activeUrl) return
    // A new model is incoming — it's not "ready" until it loads + measures.
    setModelReady(false)
    if (attract) {
      setActiveUrl(modelUrl)
      setOpacity(1)
      return
    }
    setOpacity(0)
    const t = setTimeout(() => {
      setActiveUrl(modelUrl)
      setOpacity(1)
    }, CROSSFADE_HALF_MS)
    return () => clearTimeout(t)
  }, [modelUrl, activeUrl, attract])

  // Attract per-model sequence: once the active model has loaded + faded in
  // (modelReady && opacity === 1), let it settle, then — if it's gated AND
  // explodable — play the slow explode→hold→reassemble flourish; otherwise just
  // dwell on the slow rotation. When the sequence (or dwell) ends, ask the loop
  // to crossfade to the next model. A watchdog guarantees progress even if a
  // model never reports ready (hung/broken load), so the loop never stalls.
  // Deps intentionally exclude attractExplode / onAttractAdvance (read via refs)
  // so the sequence starts exactly once per arrived model.
  useEffect(() => {
    const m = motionRef.current
    const timers: ReturnType<typeof setTimeout>[] = []
    const clearAll = () => {
      timers.forEach(clearTimeout)
      timers.length = 0
    }
    m.attractFlourishActive = false

    if (calibrating) return // calibrator owns the model; no flourish / advance
    if (!attract) return // active mode → the reveal flourish owns the explode

    // Not arrived yet → wait, but guard against a model that never loads.
    if (!modelReady || opacity !== 1) {
      timers.push(
        setTimeout(() => onAttractAdvanceRef.current?.(), ATTRACT_WATCHDOG_MS),
      )
      return clearAll
    }

    // Arrived (fully exploded for explodable models). Run the lifecycle:
    // assemble-in → 360° turn → disassemble-out, then advance IMMEDIATELY — the
    // disassemble IS the exit, so the next model assembles in with no fade or
    // dwell. Explodable models fly their parts; non-explodable ones hold + turn.
    m.attractFlourishActive = true
    m.attractFlourishStart = performance.now()
    timers.push(
      setTimeout(() => {
        m.attractFlourishActive = false
        onAttractAdvanceRef.current?.()
      }, ATTRACT_LIFECYCLE_MS),
    )
    return clearAll
  }, [attract, modelReady, opacity, activeUrl, calibrating])

  // Prefetch the upcoming model so the crossfade swap is instant.
  useEffect(() => {
    if (!prefetchUrl) return
    useGLTF.preload(prefetchUrl, undefined, undefined, gltfLoaderExtender)
  }, [prefetchUrl])

  // Bound memory: keep the visible + prefetched models (and a couple of recents)
  // in drei's cache, dispose the oldest beyond the cap. Stops a 24/7 kiosk from
  // accumulating all 19 GLTFs over hours of cycling.
  const seenRef = useRef<string[]>([])
  useEffect(() => {
    const seen = seenRef.current
    for (const u of [activeUrl, prefetchUrl]) {
      if (u && !seen.includes(u)) seen.push(u)
    }
    const keep = new Set([activeUrl, prefetchUrl].filter(Boolean) as string[])
    while (seen.length > MODEL_CACHE_CAP) {
      const idx = seen.findIndex((u) => !keep.has(u))
      if (idx < 0) break
      const [url] = seen.splice(idx, 1)
      try {
        useGLTF.clear(url)
      } catch {
        /* already cleared */
      }
    }
  }, [activeUrl, prefetchUrl])

  return (
    <div
      onPointerDown={hideHint}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        opacity,
        transition: `opacity ${CROSSFADE_HALF_MS}ms ease`,
      }}
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{
          position: [0, 0, 5.5],
          fov: orientation === 'portrait' ? 34 : 30,
          near: 0.1,
          far: 100,
        }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{
          background: 'transparent',
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      >
        <Lights />

        {/* Environment HDR in its OWN Suspense so its load never blanks the
            model area / skeleton. */}
        <Suspense fallback={null}>
          <Environment preset="apartment" />
        </Suspense>

        <group ref={modelGroupRef}>
          {/* Materialisation skeleton — sibling of the model, inside the group,
              so it rides the spin and sits inside the HUD cube. */}
          <LoadingSkeleton active={modelLoading} />

          {/* Only the model suspends here; its fallback just flips modelLoading
              (renders no 3D), so cached models don't flash the skeleton. */}
          <Suspense fallback={<LoadSignal onChange={setModelLoading} />}>
            <ModelErrorBoundary url={activeUrl} onError={onModelError}>
              <GltfModel
                url={activeUrl}
                fitZRef={fitZRef}
                modelGroupRef={modelGroupRef}
                attract={attract}
                exploded={exploded}
                explodeConfig={explodeConfig}
                onExplodableChange={handleExplodable}
                motionRef={motionRef}
                modelRotation={modelRotation}
                calibrate={calibrating}
                onCalibrateChange={setCalibDeg}
              />
            </ModelErrorBoundary>
          </Suspense>
        </group>

        <ContactShadows
          position={[0, -0.5, 0]}
          opacity={0.35}
          blur={2.5}
          far={1}
          scale={5}
          resolution={1024}
        />

        <AnchorProjector
          anchors={anchors}
          modelGroupRef={modelGroupRef}
          anchorStateRef={anchorStateRef}
          cubeStateRef={cubeStateRef}
        />
        <ModelMotion
          modelGroupRef={modelGroupRef}
          attract={attract}
          motionRef={motionRef}
          calibrate={calibrating}
        />
        <CameraDirector
          attract={attract}
          orientation={orientation}
          fitZRef={fitZRef}
          onControlsEnabledChange={setControlsEnabled}
        />

        <OrbitControls
          ref={orbitControlsRef as React.MutableRefObject<never>}
          enabled={controlsEnabled && !calibrating}
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.7}
          zoomSpeed={0.6}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.88}
          makeDefault
        />
      </Canvas>

      {/* Active controls + one-time gesture hint (DOM overlay) */}
      {!attract && (
        <>
          <ZoomControls
            orientation={orientation}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetView={onResetView}
          />
          <AnimatePresence>
            {showHint && <GestureHint key="hint" orientation={orientation} />}
          </AnimatePresence>
        </>
      )}

      {calibrating && <CalibratorPanel deg={calibDeg} />}
    </div>
  )
}

/** Dev-only calibrator HUD: shows the live rest-pose Euler degrees + a copy
 *  button so the value can be pasted straight into a product's `modelRotation`. */
function CalibratorPanel({ deg }: { deg: [number, number, number] }) {
  const snippet = `"modelRotation": [${deg[0]}, ${deg[1]}, ${deg[2]}]`
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 50,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(17, 24, 39, 0.92)',
        color: '#e5e7eb',
        fontFamily:
          'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        maxWidth: 320,
      }}
    >
      <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>
        ORIENTATION CALIBRATOR
      </div>
      <div style={{ marginBottom: 8 }}>
        <code style={{ color: '#fbbf24' }}>{snippet}</code>
      </div>
      <button
        onClick={() => navigator.clipboard?.writeText(snippet)}
        style={{
          appearance: 'none',
          border: '1px solid #374151',
          background: '#1f2937',
          color: '#e5e7eb',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 11,
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        Copy to clipboard
      </button>
      <div style={{ color: '#9ca3af', fontSize: 11 }}>
        Drag = yaw/pitch · ←→↑↓ = nudge · Q/E = roll · Shift = fine · R = reset ·
        C = exit
      </div>
    </div>
  )
}

function ZoomControls({
  orientation,
  onZoomIn,
  onZoomOut,
  onResetView,
}: {
  orientation: 'landscape' | 'portrait'
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
}) {
  // Horizontal row centred below the model. Order left→right: zoom out, reset,
  // zoom in. Landscape centres on the MODEL (which the active view-offset nudges
  // left for the info panel), not the canvas/window. Sits close under the model;
  // portrait stays above the "X / 23 · CATEGORY" counter (model → zoom → counter
  // → info). Touch-sized buttons.
  const isPortrait = orientation === 'portrait'
  return (
    <div
      style={{
        position: 'absolute',
        bottom: isPortrait ? 132 : 60,
        left: isPortrait ? '50%' : `${(0.5 - ACTIVE_VIEW_OFFSET) * 100}%`,
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        zIndex: 6,
      }}
    >
      <CircleButton label="Zoom out" onClick={onZoomOut}>
        <line x1="5" y1="12" x2="19" y2="12" />
      </CircleButton>
      <CircleButton label="Reset view" onClick={onResetView}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <polyline points="3 3 3 8 8 8" />
      </CircleButton>
      <CircleButton label="Zoom in" onClick={onZoomIn}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </CircleButton>
    </div>
  )
}

function CircleButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const d = 56
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: d,
        height: d,
        borderRadius: '50%',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#0072bc',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        padding: 0,
      }}
    >
      <svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  )
}

function GestureHint({ orientation }: { orientation: 'landscape' | 'portrait' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      // Keep the centring translate alive alongside the animated scale (framer
      // would otherwise overwrite the whole transform).
      transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
      style={{
        // Floats centred ON the model — it's a hint about manipulating the model,
        // so it sits where the gesture happens. Shares the model's horizontal
        // centre (landscape nudged left by the active view-offset) and the canvas
        // vertical centre. Auto-dismisses (4.5s) and clears on first touch.
        position: 'absolute',
        top: '50%',
        left:
          orientation === 'portrait'
            ? '50%'
            : `${(0.5 - ACTIVE_VIEW_OFFSET) * 100}%`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 18px',
        borderRadius: 999,
        background: 'rgba(255, 255, 255, 0.92)',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        fontFamily:
          'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: '#0072bc',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12a9 9 0 0 1 9-9" />
        <polyline points="12 3 9 6 12 9" transform="translate(0 0)" />
        <path d="M21 12a9 9 0 0 1-9 9" />
        <polyline points="12 21 15 18 12 15" />
      </svg>
      Drag to rotate · pinch to zoom
    </motion.div>
  )
}

export default KioskCanvas
