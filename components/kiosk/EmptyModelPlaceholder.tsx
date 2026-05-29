'use client'

import { Package } from 'lucide-react'

type EmptyModelPlaceholderProps = {
  productName: string
  variant: 'tactical' | 'gallery'
}

const MONO_STACK =
  'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'

/**
 * DOM placeholder shown in the canvas area when a product has no 3D model.
 * NOT a Three.js scene — pure DOM with a Lucide icon.
 */
export function EmptyModelPlaceholder({
  productName,
  variant,
}: EmptyModelPlaceholderProps) {
  const isTactical = variant === 'tactical'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      <Package
        size={isTactical ? 80 : 96}
        strokeWidth={1}
        color={isTactical ? 'rgba(0, 114, 188, 0.35)' : 'rgba(0, 114, 188, 0.25)'}
      />
      <div
        style={{
          fontFamily: MONO_STACK,
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: isTactical ? 'rgba(255, 255, 255, 0.4)' : '#9ca3af',
          textAlign: 'center',
        }}
      >
        3D Model · Pending
      </div>
      <div
        style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: isTactical ? 16 : 18,
          fontWeight: 700,
          color: isTactical ? 'rgba(255, 255, 255, 0.6)' : '#6b7280',
          textAlign: 'center',
          maxWidth: 320,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          lineHeight: 1.2,
          padding: '0 24px',
        }}
      >
        {productName}
      </div>
    </div>
  )
}
