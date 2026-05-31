'use client'

import { tokens } from './tokens'

/**
 * "Disassemble" / "Assemble" toggle for the exploded view. Renders nothing unless
 * the loaded model is explodable (≥2 parts and not `explode: false`) — same
 * graceful skip pattern as the QR button.
 */
export function ExplodeButton({
  explodable,
  exploded,
  onToggle,
}: {
  explodable: boolean
  exploded: boolean
  onToggle: () => void
}) {
  if (!explodable) return null

  return (
    <button
      onClick={onToggle}
      aria-pressed={exploded}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        background: exploded ? tokens.blue : 'transparent',
        color: exploded ? tokens.textOnBlue : tokens.blue,
        border: `1px solid ${tokens.blue}`,
        cursor: 'pointer',
        fontFamily: tokens.monoStack,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      <ExplodeGlyph exploded={exploded} />
      {exploded ? 'Assemble' : 'Disassemble'}
    </button>
  )
}

function ExplodeGlyph({ exploded }: { exploded: boolean }) {
  // Arrows out (explode) vs in (collapse).
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {exploded ? (
        <>
          <polyline points="9 4 4 4 4 9" />
          <polyline points="15 4 20 4 20 9" />
          <polyline points="9 20 4 20 4 15" />
          <polyline points="15 20 20 20 20 15" />
          <line x1="4" y1="4" x2="9" y2="9" />
          <line x1="20" y1="4" x2="15" y2="9" />
          <line x1="4" y1="20" x2="9" y2="15" />
          <line x1="20" y1="20" x2="15" y2="15" />
        </>
      ) : (
        <>
          <polyline points="4 9 9 9 9 4" />
          <polyline points="20 9 15 9 15 4" />
          <polyline points="4 15 9 15 9 20" />
          <polyline points="20 15 15 15 15 20" />
          <line x1="9" y1="9" x2="4" y2="4" />
          <line x1="15" y1="9" x2="20" y2="4" />
          <line x1="9" y1="15" x2="4" y2="20" />
          <line x1="15" y1="15" x2="20" y2="20" />
        </>
      )}
    </svg>
  )
}

export default ExplodeButton
