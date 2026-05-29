'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { tokens } from './tokens'

export type AnchorState = {
  x: number          // screen px from left
  y: number          // screen px from top
  visible: boolean   // false if anchor is behind camera
  z: number          // raw NDC z (for debugging)
}

type Props = {
  id: string
  label: string
  value: string
  align?: 'left' | 'right'
  delay?: number
  chipOffset: { x: number; y: number }
  anchorStateRef: React.MutableRefObject<Record<string, AnchorState>>
  isMuted?: boolean
  isFocused?: boolean
  onClick?: () => void
}

export function HudChip({
  id,
  label,
  value,
  align = 'left',
  delay = 0,
  chipOffset,
  anchorStateRef,
  isMuted = false,
  isFocused = false,
  onClick,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay * 1000 + 50)
    return () => clearTimeout(t)
  }, [delay])

  useEffect(() => {
    if (!mounted) return
    let raf = 0
    const tick = () => {
      const state = anchorStateRef.current[id]
      const el = wrapperRef.current
      if (el && state) {
        const targetX = state.x + chipOffset.x
        const targetY = state.y + chipOffset.y
        el.style.transform = `translate(${targetX}px, ${targetY}px) translate(-50%, -50%)`

        let opacity = 1
        if (!state.visible) opacity = 0
        else if (isFocused) opacity = 1
        else if (isMuted) opacity = 0.35
        el.style.opacity = String(opacity)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [id, mounted, isFocused, isMuted, anchorStateRef, chipOffset.x, chipOffset.y])

  return (
    <motion.div
      ref={wrapperRef}
      onClick={onClick}
      initial={{ opacity: 0, y: -4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.95 }}
      transition={{ delay, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 5,
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: align,
        transition: 'opacity 250ms ease',
        userSelect: 'none',
      }}
    >
      {/* Callout line */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          ...(align === 'left' ? { right: '100%' } : { left: '100%' }),
          width: 24,
          height: 1,
          backgroundColor: tokens.blue,
          opacity: 0.55,
          transform: 'translateY(-50%)',
        }}
      />

      {/* Corner bracket */}
      <div
        style={{
          width: 8,
          height: 8,
          borderTop: `1px solid ${tokens.blue}`,
          borderLeft: align === 'left' ? `1px solid ${tokens.blue}` : 'none',
          borderRight: align === 'right' ? `1px solid ${tokens.blue}` : 'none',
          marginBottom: 4,
          marginLeft: align === 'left' ? 0 : 'auto',
          animation: isFocused
            ? 'hudChipPulse 1.5s ease-in-out infinite alternate'
            : undefined,
        }}
      />

      {/* Chip body */}
      <div
        style={{
          background: '#ffffff',
          border: `1px solid ${tokens.blueMuted}`,
          padding: '6px 10px',
          boxShadow: '0 2px 8px rgba(0, 114, 188, 0.06)',
        }}
      >
        <div
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: tokens.blue,
            marginBottom: 2,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 13,
            letterSpacing: '0.04em',
            color: tokens.text,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
      </div>

      <style>{`
        @keyframes hudChipPulse {
          from { opacity: 0.55; }
          to   { opacity: 1; }
        }
      `}</style>
    </motion.div>
  )
}
