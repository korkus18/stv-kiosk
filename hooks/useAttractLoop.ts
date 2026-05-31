'use client'

import { useEffect, useRef } from 'react'
import type { Product } from '@/data/products'

/** Default dwell on each model before the crossfade to the next. */
export const DEFAULT_ATTRACT_INTERVAL_MS = 6000

export interface UseAttractLoopOptions {
  /** Run the loop only in attract mode. */
  enabled: boolean
  /** Ordered attract pool (already filtered to playable / featured products). */
  pool: Product[]
  selectedId: string
  setSelectedId: (id: string) => void
  intervalMs?: number
}

/**
 * Drives the attract auto-cycle: advances the selected product through `pool`
 * every `intervalMs`. Pure timing/state — no 3D imports, so it stays out of the
 * heavy R3F bundle. Prefetch + disposal of models is owned by KioskCanvas.
 *
 * If the current selection isn't in the pool (entering attract, or the shown
 * model just got marked broken), it snaps to the first pool item so the loop
 * never sits on a missing/broken model.
 */
export function useAttractLoop({
  enabled,
  pool,
  selectedId,
  setSelectedId,
  intervalMs = DEFAULT_ATTRACT_INTERVAL_MS,
}: UseAttractLoopOptions) {
  // Latest values, read inside the interval without re-arming it each tick.
  const poolRef = useRef(pool)
  poolRef.current = pool
  const selRef = useRef(selectedId)
  selRef.current = selectedId
  const setRef = useRef(setSelectedId)
  setRef.current = setSelectedId

  // Keep the selection inside the pool (handles entering attract + broken skip).
  useEffect(() => {
    if (!enabled || pool.length === 0) return
    if (!pool.some((p) => p.id === selectedId)) {
      setRef.current(pool[0].id)
    }
  }, [enabled, pool, selectedId])

  // Advance timer — steady cadence, not reset by each advance.
  useEffect(() => {
    if (!enabled || pool.length <= 1) return
    const timer = setInterval(() => {
      const p = poolRef.current
      if (p.length <= 1) return
      const i = p.findIndex((x) => x.id === selRef.current)
      const next = i < 0 ? 0 : (i + 1) % p.length
      setRef.current(p[next].id)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [enabled, intervalMs, pool.length])
}
