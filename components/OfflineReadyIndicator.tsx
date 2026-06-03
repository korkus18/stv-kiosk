'use client'

import { useEffect, useState } from 'react'
import type { WarmupProgress } from '@/hooks/useModelWarmup'

/**
 * Small, unobtrusive operator HUD (bottom-right) reporting the offline warm-up:
 * while models download it shows "Caching N / M", and once everything is cached
 * it briefly confirms "Ready offline" — the cue that it's safe to disconnect the
 * hotspot — then fades away. Purely informational; ignores touch.
 */
export function OfflineReadyIndicator({ progress }: { progress: WarmupProgress }) {
  const { done, total, complete } = progress
  const [hidden, setHidden] = useState(false)

  // After completion, linger ~6 s so the operator can see it, then hide.
  useEffect(() => {
    if (!complete) return
    const t = setTimeout(() => setHidden(true), 6000)
    return () => clearTimeout(t)
  }, [complete])

  if (total === 0 || hidden) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderRadius: 999,
        background: complete ? 'rgba(16, 122, 87, 0.95)' : 'rgba(0, 114, 188, 0.95)',
        color: '#ffffff',
        fontFamily:
          'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        letterSpacing: '0.04em',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.18)',
        pointerEvents: 'none',
        opacity: complete ? 1 : 0.92,
        transition: 'opacity 0.4s ease, background 0.4s ease',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#ffffff',
          opacity: complete ? 1 : 0.6,
        }}
      />
      {complete
        ? 'Ready offline · all models cached'
        : `Caching models ${done} / ${total}`}
    </div>
  )
}
