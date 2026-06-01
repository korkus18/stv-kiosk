'use client'

interface STVLogoProps {
  /** Size multiplier (height-based). 1 ≈ 48px tall; aspect preserved. */
  scale?: number
}

/** Official STV GROUP logo (public/stv-logo.svg) — the brand asset, also used
 *  as the favicon. Sized by height so it sits cleanly in the top bars; aspect
 *  ratio is preserved by the SVG itself. */
export default function STVLogo({ scale = 1 }: STVLogoProps) {
  return (
    <img
      src="/stv-logo.svg"
      alt="STV GROUP"
      draggable={false}
      style={{ height: 48 * scale, width: 'auto', display: 'block', flexShrink: 0 }}
    />
  )
}
