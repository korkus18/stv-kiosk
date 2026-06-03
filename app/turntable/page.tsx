'use client'

/**
 * DEV-ONLY orientation turntable harness (not part of the kiosk experience).
 *
 * Renders a single GLTF model, centred and fit, under a fixed front camera,
 * with a rest-pose rotation supplied via query params — so an offline
 * screenshot driver can sweep yaw/pitch/roll and a human (or vision model)
 * can pick the orientation that puts the printed text toward the camera.
 *
 * URL: /turntable?model=/models/.../x.gltf&x=0&y=45&z=0&label=foo
 *
 * Sets `window.__captureReady = true` a few frames after the model is in,
 * so the driver knows when the screenshot is safe to take.
 *
 * Safe to delete once orientation calibration is done.
 */

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { gltfLoaderExtender } from '@/components/kiosk/KioskCanvas'

function useQuery() {
  const [q, setQ] = useState<Record<string, string>>({})
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const o: Record<string, string> = {}
    p.forEach((v, k) => (o[k] = v))
    setQ(o)
  }, [])
  return q
}

function Model({ url, deg }: { url: string; deg: [number, number, number] }) {
  const { scene } = useGLTF(url, undefined, undefined, gltfLoaderExtender)

  useLayoutEffect(() => {
    // Normalise: reset any prior transform first (useGLTF caches+reuses the
    // scene across renders), fit to a unit-ish box, apply rest-pose rotation,
    // recentre on the ROTATED bounding box so it's always dead-centre.
    scene.scale.setScalar(1)
    scene.rotation.set(0, 0, 0)
    scene.position.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(scene)
    const size = raw.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const fit = 1.35 / maxDim
    scene.scale.setScalar(fit)
    // Mirror-fix parity with KioskCanvas: a few STEP→glTF assets baked their
    // surface text mirrored; the kiosk flips Z to un-mirror. Replicate here so
    // the orientation we pick matches what the kiosk will actually show.
    const MIRROR = ['round_152mm_he_full', 'projectile_155mm_he_m107']
    if (MIRROR.some((f) => url.includes(f))) scene.scale.z = -fit
    scene.position.set(0, 0, 0)
    scene.rotation.set(
      THREE.MathUtils.degToRad(deg[0]),
      THREE.MathUtils.degToRad(deg[1]),
      THREE.MathUtils.degToRad(deg[2]),
    )
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    scene.position.sub(box.getCenter(new THREE.Vector3()))
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
  }, [scene, deg])

  return <primitive object={scene} />
}

function ReadyGate() {
  // Lives INSIDE <Suspense> so it only starts counting once the model is
  // actually mounted (and its layout-effect fit/centre has run).
  const n = useRef(0)
  useFrame(() => {
    n.current += 1
    if (n.current === 6) {
      ;(window as unknown as { __captureReady?: boolean }).__captureReady = true
    }
  })
  return null
}

export default function TurntablePage() {
  const q = useQuery()
  const url = q.model || ''
  const deg: [number, number, number] = [
    Number(q.x ?? 0),
    Number(q.y ?? 0),
    Number(q.z ?? 0),
  ]
  // Outer presentation tilt — applied as a PARENT group so it composes the same
  // way for every model in a shape-group → uniform visual angle by construction.
  const tilt: [number, number, number] = [
    THREE.MathUtils.degToRad(Number(q.tx ?? 0)),
    THREE.MathUtils.degToRad(Number(q.ty ?? 0)),
    THREE.MathUtils.degToRad(Number(q.tz ?? 0)),
  ]
  const label = q.label || ''

  if (!url) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        pass ?model=/models/.../x.gltf&x=0&y=0&z=0
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfd3d8' }}>
      <Canvas
        shadows
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.5,
        }}
        camera={{ position: [0, 0, 3.0], fov: 32, near: 0.1, far: 100 }}
      >
        {/* No Environment map (CDN HDR fails in headless Chrome) — rely on a
            bright multi-light rig so dark olive ordnance + stencil text read. */}
        <ambientLight intensity={1.4} />
        <hemisphereLight args={['#ffffff', '#9099a0', 1.0]} />
        <directionalLight position={[3, 5, 3]} intensity={2.0} castShadow />
        <directionalLight position={[-4, 2, 2]} intensity={1.1} />
        <directionalLight position={[0, 2, -4]} intensity={0.9} />
        <directionalLight position={[0, -3, 2]} intensity={0.5} />
        <Suspense fallback={null}>
          <group rotation={tilt}>
            <Model url={url} deg={deg} />
          </group>
          <ReadyGate />
        </Suspense>
        <ContactShadows
          position={[0, -1.05, 0]}
          opacity={0.3}
          blur={2.5}
          scale={5}
          far={2}
        />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          font: '13px ui-monospace, monospace',
          color: '#111',
          background: 'rgba(255,255,255,0.7)',
          padding: '2px 6px',
          borderRadius: 4,
        }}
      >
        {label} · x{deg[0]} y{deg[1]} z{deg[2]}
      </div>
    </div>
  )
}
