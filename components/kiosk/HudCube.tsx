'use client'

import { useEffect, useRef } from 'react'
import { tokens } from './tokens'

/**
 * Screen-space state of one chip's slice of the imaginary cube, written each frame
 * by AnchorProjector (projected through the model's full transform, so it rotates
 * with the model).
 *   - cx, cy     : the chip corner of the cube
 *   - stubs      : 3 short cube-edge endpoints (corner → each neighbour) — the
 *                  "3 lines" that sketch the cube edges meeting at this corner
 *   - px, py     : the leader pin on the model surface (corner direction)
 *   - strength   : leader occlusion 0..1 (1 = facing camera, 0 = far side/behind)
 */
export type CubeState = {
  cx: number
  cy: number
  stubs: { x: number; y: number }[]
  px: number
  py: number
  strength: number
}

type Props = {
  ids: string[]
  cubeStateRef: React.MutableRefObject<Record<string, CubeState>>
}

/** Cube-edge wireframe opacity (constant — it's the structural frame). */
const EDGE_OPACITY = 0.3
/** Leader line opacity at full strength (fades with back-face occlusion). */
const LEADER_OPACITY = 0.5
const HIDE_BELOW = 0.04

type Slot = {
  g: SVGGElement | null
  stubs: (SVGLineElement | null)[]
  leader: SVGLineElement | null
  pin: SVGGElement | null
}

/**
 * SVG overlay drawing the imaginary cube around the model: at each category chip's
 * corner, 3 short edge stubs sketch the cube, and a thin leader line runs in to a
 * pin on the model surface, fading out (occlusion) as that point wraps to the far
 * side. Everything rides the model's rotation. Runs in a requestAnimationFrame
 * loop writing SVG attributes directly (no React re-render). Sits below the chips.
 */
export function HudCube({ ids, cubeStateRef }: Props) {
  const slots = useRef<Record<string, Slot>>({})

  useEffect(() => {
    let raf = 0
    const tick = () => {
      for (const id of ids) {
        const slot = slots.current[id]
        const st = cubeStateRef.current[id]
        if (!slot || !slot.g || !st) continue

        // Cube-edge stubs (constant opacity).
        for (let k = 0; k < 3; k++) {
          const line = slot.stubs[k]
          const p = st.stubs[k]
          if (!line || !p) continue
          line.setAttribute('x1', String(st.cx))
          line.setAttribute('y1', String(st.cy))
          line.setAttribute('x2', String(p.x))
          line.setAttribute('y2', String(p.y))
        }

        // Leader line + pin marker (opacity follows occlusion strength).
        const lop = st.strength * LEADER_OPACITY
        if (slot.leader) {
          slot.leader.setAttribute('x1', String(st.cx))
          slot.leader.setAttribute('y1', String(st.cy))
          slot.leader.setAttribute('x2', String(st.px))
          slot.leader.setAttribute('y2', String(st.py))
          slot.leader.style.opacity = lop < HIDE_BELOW ? '0' : String(lop)
        }
        if (slot.pin) {
          slot.pin.setAttribute('transform', `translate(${st.px} ${st.py})`)
          slot.pin.style.opacity = lop < HIDE_BELOW ? '0' : String(lop)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [ids, cubeStateRef])

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 4, // below chips (z=5), above the canvas
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {ids.map((id) => {
        const ensure = (): Slot =>
          (slots.current[id] ??= { g: null, stubs: [null, null, null], leader: null, pin: null })
        return (
          <g
            key={id}
            ref={(el) => {
              ensure().g = el
            }}
          >
            {/* Cube-edge stubs */}
            {[0, 1, 2].map((k) => (
              <line
                key={k}
                ref={(el) => {
                  ensure().stubs[k] = el
                }}
                stroke={tokens.blue}
                strokeWidth={1}
                opacity={EDGE_OPACITY}
              />
            ))}
            {/* Leader to the model surface */}
            <line
              ref={(el) => {
                ensure().leader = el
              }}
              stroke={tokens.blue}
              strokeWidth={1}
              style={{ opacity: 0, transition: 'opacity 160ms linear' }}
            />
            {/* Pin marker on the model surface */}
            <g
              ref={(el) => {
                ensure().pin = el
              }}
              style={{ opacity: 0, transition: 'opacity 160ms linear' }}
            >
              <circle r={1.6} fill={tokens.blue} />
              <circle r={4} fill="none" stroke={tokens.blue} strokeWidth={0.75} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
