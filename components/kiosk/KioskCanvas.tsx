'use client'

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

function GltfModel({
  url,
  fitZRef,
  modelGroupRef,
  exploded = false,
  explodeConfig,
  onExplodableChange,
  motionRef,
}: {
  url: string
  fitZRef: React.MutableRefObject<number>
  modelGroupRef: React.RefObject<THREE.Group | null>
  exploded?: boolean
  explodeConfig?: ExplodeField
  onExplodableChange?: (explodable: boolean) => void
  motionRef: React.MutableRefObject<MotionState>
}) {
  const { scene } = useGLTF(url, undefined, undefined, gltfLoaderExtender)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const explodeRef = useRef<ExplodeState | null>(null)
  const progressRef = useRef(0)
  const explodedRef = useRef(exploded)
  explodedRef.current = exploded
  const controls = useThree((s) => s.controls) as unknown as {
    minDistance: number
    maxDistance: number
  } | null

  useEffect(() => {
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

      const scaledBox = new THREE.Box3().setFromObject(scene)
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
      scene.position.sub(scaledCenter)

      // Elongation tilt — long cylindrical objects (Bangalore et al.) get
      // some 3D presence rather than a flat horizontal line. Threshold > 5
      // keeps Hayrick / chunkier shapes upright.
      const dims = [rawSize.x, rawSize.y, rawSize.z].sort((a, b) => b - a)
      const aspectRatio = dims[0] / Math.max(dims[1], 0.001)
      if (aspectRatio > 5) {
        scene.rotation.z = -Math.PI / 8
        scene.rotation.y = Math.PI / 7
        scene.rotation.x = Math.PI / 16
      }

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

    scene.updateMatrixWorld(true)
    const finalBox = new THREE.Box3().setFromObject(scene)
    const diag = finalBox.getSize(new THREE.Vector3()).length()

    const persp = camera as THREE.PerspectiveCamera
    const fov = persp.fov ?? 30

    // Aspect-aware fit: distance so the model fits BOTH the vertical and the
    // horizontal FOV (with margin via 0.8). In landscape the vertical term wins
    // (unchanged framing); in the narrow portrait viewport the horizontal term
    // wins, so wide/long models no longer overflow the side edges.
    const vHalf = (fov * Math.PI) / 360
    const aspect = size.width / Math.max(size.height, 1)
    const hHalf = Math.atan(Math.tan(vHalf) * aspect)
    const fitV = diag / (2 * Math.tan(vHalf) * 0.8)
    const fitH = diag / (2 * Math.tan(hHalf) * 0.8)
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
    progressRef.current = 0
    onExplodableChange?.(state !== null)
  }, [scene, camera, controls, fitZRef, size.width, size.height, explodeConfig, onExplodableChange])

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

interface AnchorProjectorProps {
  anchors: HudAnchor[]
  modelGroupRef: React.RefObject<THREE.Group | null>
  anchorStateRef: React.MutableRefObject<Record<string, AnchorState>>
}

function AnchorProjector({
  anchors,
  modelGroupRef,
  anchorStateRef,
}: AnchorProjectorProps) {
  const tempVec = useMemo(() => new THREE.Vector3(), [])
  // Project anchors through the model's position+scale but NOT its spin, so the
  // HUD chips sit as a fixed frame while the model rotates inside.
  const frameMat = useMemo(() => new THREE.Matrix4(), [])
  const mPos = useMemo(() => new THREE.Vector3(), [])
  const mScale = useMemo(() => new THREE.Vector3(), [])
  const mQuat = useMemo(() => new THREE.Quaternion(), [])
  const noSpin = useMemo(() => new THREE.Quaternion(), [])

  useFrame(({ camera, size }) => {
    if (!modelGroupRef.current) return
    modelGroupRef.current.matrixWorld.decompose(mPos, mQuat, mScale)
    frameMat.compose(mPos, noSpin, mScale)
    for (const anchor of anchors) {
      tempVec.copy(anchor.anchorPos)
      tempVec.applyMatrix4(frameMat)
      tempVec.project(camera)

      const x = (tempVec.x * 0.5 + 0.5) * size.width
      const y = (-tempVec.y * 0.5 + 0.5) * size.height
      const visible = tempVec.z < 1

      anchorStateRef.current[anchor.id] = { x, y, visible, z: tempVec.z }
    }
  })

  return null
}

interface ModelMotionProps {
  modelGroupRef: React.RefObject<THREE.Group | null>
  attract: boolean
  motionRef: React.MutableRefObject<MotionState>
}

/**
 * Drives the root group's Y spin:
 *  - attract: slow continuous auto-rotate.
 *  - flourish (attract→active reveal): a fast ~360° bell-shaped spin.
 *  - active detail: slow auto-rotate, PAUSED while the visitor is interacting
 *    (drag/zoom), resuming after RESUME_DELAY_MS of stillness.
 * Explode is handled separately (GltfModel) on the same flourish clock.
 */
function ModelMotion({ modelGroupRef, attract, motionRef }: ModelMotionProps) {
  const speed = useRef<number>(0)

  useFrame((_, delta) => {
    const g = modelGroupRef.current
    if (!g) return
    const m = motionRef.current
    const now = performance.now()

    if (m.flourishActive && !m.aborted) {
      const t = Math.min(1, (now - m.flourishStart) / FLOURISH_MS)
      // bell: 0 → peak → 0, integrates to roughly one full turn; snappy (no lag)
      speed.current = FLOURISH_SPIN_PEAK * Math.sin(Math.PI * t)
      g.rotation.y += speed.current * delta
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
  modelUrl = HAYRICK_GLTF_PATH,
  orientation = 'landscape',
  attract = false,
  onModelError,
  prefetchUrl,
  exploded = false,
  explodeConfig,
  onExplodableChange,
}: KioskCanvasProps) {
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const orbitControlsRef = useRef<OrbitControlsLike | null>(null)
  const fitZRef = useRef<number>(0)
  const motionRef = useRef<MotionState>({
    flourishActive: false,
    flourishStart: 0,
    aborted: false,
    lastInteract: 0,
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

  // Crossfade: when the model url changes, fade the canvas out to the bg, swap
  // the model while invisible (it's been prefetched by the attract loop), then
  // fade back in. One WebGL context, no double-mount.
  const [activeUrl, setActiveUrl] = useState(modelUrl)
  const [opacity, setOpacity] = useState(1)
  useEffect(() => {
    if (modelUrl === activeUrl) return
    setOpacity(0)
    const t = setTimeout(() => {
      setActiveUrl(modelUrl)
      setOpacity(1)
    }, CROSSFADE_HALF_MS)
    return () => clearTimeout(t)
  }, [modelUrl, activeUrl])

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
        shadows
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
        <Suspense fallback={null}>
          <Environment preset="apartment" />

          <group ref={modelGroupRef}>
            <ModelErrorBoundary url={activeUrl} onError={onModelError}>
              <GltfModel
                url={activeUrl}
                fitZRef={fitZRef}
                modelGroupRef={modelGroupRef}
                exploded={exploded}
                explodeConfig={explodeConfig}
                onExplodableChange={onExplodableChange}
                motionRef={motionRef}
              />
            </ModelErrorBoundary>
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
          />
          <ModelMotion
            modelGroupRef={modelGroupRef}
            attract={attract}
            motionRef={motionRef}
          />
          <CameraDirector
            attract={attract}
            orientation={orientation}
            fitZRef={fitZRef}
            onControlsEnabledChange={setControlsEnabled}
          />
        </Suspense>

        <OrbitControls
          ref={orbitControlsRef as React.MutableRefObject<never>}
          enabled={controlsEnabled}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        // Sits just ABOVE the zoom row and shares its horizontal centre (on the
        // model — landscape is nudged left by the active view-offset).
        position: 'absolute',
        bottom: orientation === 'portrait' ? 204 : 132,
        left:
          orientation === 'portrait'
            ? '50%'
            : `${(0.5 - ACTIVE_VIEW_OFFSET) * 100}%`,
        transform: 'translateX(-50%)',
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
