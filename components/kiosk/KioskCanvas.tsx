'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import {
  Environment,
  OrbitControls,
  ContactShadows,
  useGLTF,
} from '@react-three/drei'
import * as THREE from 'three'
import type { GLTFLoader } from 'three-stdlib'
import type { AnchorState } from './HudChip'

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

const gltfLoaderExtender = makeGltfLoaderExtender()

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
}

const TARGET_MAX_DIM = 0.88
const FIT_APPLIED = Symbol.for('stv.kioskCanvas.fitApplied')

function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, undefined, undefined, gltfLoaderExtender)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3
    minDistance: number
    maxDistance: number
    update: () => void
    saveState: () => void
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
    const fitZ = diag / (2 * Math.tan((fov * Math.PI) / 360) * 0.8)

    persp.position.set(0, 0, fitZ)
    persp.near = Math.max(fitZ / 1000, 0.01)
    persp.far = fitZ * 100
    persp.updateProjectionMatrix()

    if (controls) {
      controls.target.set(0, 0, 0)
      controls.minDistance = fitZ * 0.3
      controls.maxDistance = fitZ * 4
      controls.update()
      controls.saveState()
    }
  }, [scene, camera, controls])

  return <primitive object={scene} />
}

interface ViewOffsetControllerProps {
  xPercent: number
}

function ViewOffsetController({ xPercent }: ViewOffsetControllerProps) {
  const camera = useThree((s: RootState) => s.camera)
  const width = useThree((s: RootState) => s.size.width)
  const height = useThree((s: RootState) => s.size.height)

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera
    if (xPercent === 0) {
      persp.clearViewOffset()
    } else {
      persp.setViewOffset(width, height, xPercent * width, 0, width, height)
    }
    return () => {
      persp.clearViewOffset()
    }
  }, [camera, width, height, xPercent])

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

  useFrame(({ camera, size }) => {
    if (!modelGroupRef.current) return
    for (const anchor of anchors) {
      tempVec.copy(anchor.anchorPos)
      tempVec.applyMatrix4(modelGroupRef.current.matrixWorld)
      tempVec.project(camera)

      const x = (tempVec.x * 0.5 + 0.5) * size.width
      const y = (-tempVec.y * 0.5 + 0.5) * size.height
      const visible = tempVec.z < 1

      anchorStateRef.current[anchor.id] = { x, y, visible, z: tempVec.z }
    }
  })

  return null
}

interface IdleRotatorProps {
  modelGroupRef: React.RefObject<THREE.Group | null>
  orbitControlsRef: React.RefObject<{
    addEventListener: (e: string, cb: () => void) => void
    removeEventListener: (e: string, cb: () => void) => void
  } | null>
}

function IdleRotator({ modelGroupRef, orbitControlsRef }: IdleRotatorProps) {
  const lastInteractionTime = useRef<number>(performance.now())
  const currentSpeed = useRef<number>(0)

  const IDLE_SPEED = 0.08
  const RESUME_DELAY_MS = 2500
  const LERP_FACTOR = 0.05

  useEffect(() => {
    const c = orbitControlsRef.current
    if (!c) return
    const onStart = () => {
      lastInteractionTime.current = performance.now()
      currentSpeed.current = 0
    }
    const onEnd = () => {
      lastInteractionTime.current = performance.now()
    }
    c.addEventListener('start', onStart)
    c.addEventListener('end', onEnd)
    return () => {
      c.removeEventListener('start', onStart)
      c.removeEventListener('end', onEnd)
    }
  }, [orbitControlsRef])

  useFrame((_, delta) => {
    if (!modelGroupRef.current) return
    const now = performance.now()
    const sinceInteraction = now - lastInteractionTime.current
    const isIdle = sinceInteraction > RESUME_DELAY_MS
    const target = isIdle ? IDLE_SPEED : 0
    currentSpeed.current += (target - currentSpeed.current) * LERP_FACTOR
    modelGroupRef.current.rotation.y += currentSpeed.current * delta
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
}: KioskCanvasProps) {
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const orbitControlsRef = useRef<{
    enabled: boolean
    addEventListener: (e: string, cb: () => void) => void
    removeEventListener: (e: string, cb: () => void) => void
  } | null>(null)

  const [activeUrl, setActiveUrl] = useState(modelUrl)
  const [isTransitioning, setIsTransitioning] = useState(false)
  useEffect(() => {
    if (modelUrl === activeUrl) return
    setIsTransitioning(true)
    const t = setTimeout(() => {
      setActiveUrl(modelUrl)
      setIsTransitioning(false)
    }, 220)
    return () => clearTimeout(t)
  }, [modelUrl, activeUrl])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
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
            {!isTransitioning && <GltfModel url={activeUrl} />}
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
          <IdleRotator
            modelGroupRef={modelGroupRef}
            orbitControlsRef={orbitControlsRef}
          />
          <ViewOffsetController
            xPercent={orientation === 'portrait' ? 0 : 0.18}
          />
        </Suspense>

        <OrbitControls
          ref={orbitControlsRef as React.MutableRefObject<never>}
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

      {isTransitioning && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(245, 245, 247, 0.55)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
              fontSize: 10,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'rgba(10, 10, 10, 0.55)',
            }}
          >
            Recalibrating…
          </div>
        </div>
      )}
    </div>
  )
}

export default KioskCanvas
