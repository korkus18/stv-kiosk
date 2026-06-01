'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { tokens } from './tokens'

const COL = tokens.blue

/**
 * Suspense fallback that renders NO 3D — it only reports load start/end to the
 * parent (mount → loading, unmount → loaded). Because it's a Suspense fallback,
 * it mounts ONLY when the model genuinely suspends; cached/prefetched models
 * resolve synchronously and never trigger it, so the skeleton never flashes on
 * attract-loop swaps. The visible skeleton is a sibling driven by this flag.
 */
export function LoadSignal({ onChange }: { onChange: (loading: boolean) => void }) {
  useEffect(() => {
    onChange(true)
    return () => onChange(false)
  }, [onChange])
  return null
}

/**
 * Generic "scan build-up" materialisation skeleton shown in the model's place
 * while a GLTF loads. It lives INSIDE the model group, so it rides the auto-spin
 * and sits within the HUD bounding cube in active mode (just centred in attract,
 * which doesn't draw chips). A wireframe bounding box that "draws in" with the
 * real load progress (drei useProgress) + a slowly tumbling wireframe core + a
 * sweeping scan ring. Everything cross-fades via `active`, so when the real
 * model materialises the skeleton dissolves smoothly — no hard pop.
 */
export function LoadingSkeleton({ active }: { active: boolean }) {
  const grp = useRef<THREE.Group>(null)
  const core = useRef<THREE.Group>(null)
  const scan = useRef<THREE.Mesh>(null)
  const boxMat = useRef<THREE.LineBasicMaterial>(null)
  const coreMat = useRef<THREE.LineBasicMaterial>(null)
  const scanMat = useRef<THREE.MeshBasicMaterial>(null)
  const op = useRef(0)
  const { progress } = useProgress()

  const boxGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.92, 0.92)),
    [],
  )
  const coreGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.34, 1)),
    [],
  )
  useEffect(
    () => () => {
      boxGeo.dispose()
      coreGeo.dispose()
    },
    [boxGeo, coreGeo],
  )

  useFrame((state, delta) => {
    const g = grp.current
    if (!g) return
    // Ease overall presence toward the load state; stop drawing once gone.
    op.current += ((active ? 1 : 0) - op.current) * Math.min(1, delta * 6)
    const o = op.current
    g.visible = o > 0.002
    if (!g.visible) return

    const t = state.clock.elapsedTime
    const p = THREE.MathUtils.clamp(progress / 100, 0, 1)

    if (core.current) {
      core.current.rotation.x = t * 0.45
      core.current.rotation.y = t * 0.6
      core.current.scale.setScalar(0.55 + 0.45 * p) // "constructs" as it loads
    }
    if (scan.current) {
      scan.current.position.y = Math.sin(t * 1.5) * 0.46
      scan.current.rotation.z = t * 0.3
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
    if (boxMat.current) boxMat.current.opacity = o * (0.14 + 0.34 * p)
    if (coreMat.current) coreMat.current.opacity = o * (0.32 + 0.22 * pulse)
    if (scanMat.current)
      scanMat.current.opacity = o * (0.14 + 0.2 * Math.abs(Math.sin(t * 1.5)))
  })

  return (
    <group ref={grp} visible={false}>
      {/* Bounding box wireframe — draws in with load progress */}
      <lineSegments geometry={boxGeo}>
        <lineBasicMaterial ref={boxMat} color={COL} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      {/* Tumbling wireframe core */}
      <group ref={core}>
        <lineSegments geometry={coreGeo}>
          <lineBasicMaterial ref={coreMat} color={COL} transparent opacity={0} depthWrite={false} />
        </lineSegments>
      </group>
      {/* Sweeping scan ring */}
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.46, 72]} />
        <meshBasicMaterial
          ref={scanMat}
          color={COL}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
