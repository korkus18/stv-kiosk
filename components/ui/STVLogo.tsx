'use client'

interface STVLogoProps {
  scale?: number
  /** White-on-blue variant for dark surfaces (default) vs inverted */
  variant?: 'default' | 'white'
}

export default function STVLogo({ scale = 1, variant = 'default' }: STVLogoProps) {
  const w = 72 * scale
  const h1 = 28 * scale
  const h2 = 18 * scale
  const fs1 = 18 * scale
  const fs2 = 9 * scale

  const topBg = variant === 'white' ? '#ffffff' : '#0072bc'
  const topText = variant === 'white' ? '#0072bc' : '#ffffff'
  const botBg = variant === 'white' ? '#d4d8e4' : '#59637c'
  const botText = variant === 'white' ? '#59637c' : '#ffffff'

  return (
    <svg
      width={w}
      height={(h1 + h2)}
      viewBox={`0 0 72 ${h1 + h2}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <rect x="0" y="0" width="72" height={h1} fill={topBg} />
      <text
        x="36"
        y={h1 * 0.72}
        textAnchor="middle"
        fill={topText}
        fontFamily="Barlow Condensed, sans-serif"
        fontWeight="900"
        fontSize={fs1}
        letterSpacing="2"
      >
        STV
      </text>
      <rect x="0" y={h1} width="72" height={h2} fill={botBg} />
      <text
        x="36"
        y={h1 + h2 * 0.72}
        textAnchor="middle"
        fill={botText}
        fontFamily="Barlow Condensed, sans-serif"
        fontWeight="400"
        fontSize={fs2}
        letterSpacing="4"
      >
        GROUP
      </text>
    </svg>
  )
}
