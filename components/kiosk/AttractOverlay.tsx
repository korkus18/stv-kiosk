'use client'

import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { tokens } from './tokens'

/**
 * Attract-mode overlay: a full-viewport transparent catcher that turns ANY
 * touch into "activate".
 *
 *  - The MODEL is the hero: no scrim/wash over the scene; it's shifted up by the
 *    camera (KioskCanvas attract framing) so the lower band is clear.
 *  - A thin, subtle viewfinder frame brackets the hero zone — large enough that
 *    the model never pokes out, light enough that the model dominates.
 *  - The CTA cluster (touch glyph + "TOUCH TO EXPLORE") sits BELOW the model in
 *    that clear band — it never overlaps the model — and breathes calmly.
 *
 * Render it as the last child of the layout root. Animation is opacity only
 * (GPU-composited) — cheap for a 24/7 kiosk.
 */

const BRACKET = `1.5px solid ${tokens.blue}`
const ARM = 'min(7vmin, 72px)'

export function AttractOverlay({ onActivate }: { onActivate: () => void }) {
  return (
    <div
      onPointerDown={onActivate}
      role="button"
      aria-label="Touch to explore"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        cursor: 'pointer',
      }}
    >
      {/* Subtle viewfinder framing the hero zone (model sits inside). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '13vh',
          bottom: '24vh',
          left: '7vw',
          right: '7vw',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      >
        <Corner style={{ top: 0, left: 0, borderTop: BRACKET, borderLeft: BRACKET }} />
        <Corner style={{ top: 0, right: 0, borderTop: BRACKET, borderRight: BRACKET }} />
        <Corner style={{ bottom: 0, left: 0, borderBottom: BRACKET, borderLeft: BRACKET }} />
        <Corner style={{ bottom: 0, right: 0, borderBottom: BRACKET, borderRight: BRACKET }} />
      </div>

      {/* CTA below the model, calmly breathing. */}
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '8vh',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          color: tokens.blue,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <TouchGlyph />
        <div
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 'clamp(15px, 1.7vmin, 20px)',
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginRight: '-0.34em',
          }}
        >
          Touch to explore
        </div>
        <div
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 'clamp(9px, 1vmin, 11px)',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: tokens.textMuted,
            marginRight: '-0.28em',
          }}
        >
          Interactive 3D
        </div>
      </motion.div>
    </div>
  )
}

function Corner({ style }: { style: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: ARM,
        height: ARM,
        pointerEvents: 'none',
        ...style,
      }}
    />
  )
}

function TouchGlyph() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 11V6a2 2 0 0 1 4 0v5" />
      <path d="M12 11V4a2 2 0 0 1 4 0v7" />
      <path d="M16 11V7a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.3-4a2 2 0 0 1 3.4-2L8 12" />
    </svg>
  )
}

export default AttractOverlay
