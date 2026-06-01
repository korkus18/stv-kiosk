'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Product } from '@/data/products'

/** Fallback dwell (ms) — used by the canvas only as a safety watchdog. */
export const DEFAULT_ATTRACT_INTERVAL_MS = 6000

export interface UseAttractLoopOptions {
  /** Run the loop only in attract mode. */
  enabled: boolean
  /** Ordered attract pool (already filtered to playable / featured products). */
  pool: Product[]
  selectedId: string
  setSelectedId: (id: string) => void
}

export interface UseAttractLoopResult {
  /** Advance to the next pool item. Called by the canvas when the current
   *  model's attract sequence (load → optional flourish → dwell) completes. */
  advance: () => void
}

/**
 * Drives the attract auto-cycle. Advancement is EVENT-DRIVEN, not on a fixed
 * timer: the canvas owns each model's on-screen lifecycle (wait for load → slow
 * explode/reassemble flourish if gated → dwell) and calls `advance()` when it's
 * time to crossfade to the next model — so the loop never explodes a half-loaded
 * model and per-model dwell adapts to the flourish. Pure timing/state, no 3D
 * imports, so it stays out of the heavy R3F bundle. Prefetch + disposal of
 * models is owned by KioskCanvas.
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
}: UseAttractLoopOptions): UseAttractLoopResult {
  // Latest values, read inside `advance` without re-creating the callback.
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

  const advance = useCallback(() => {
    const p = poolRef.current
    if (p.length <= 1) return
    const i = p.findIndex((x) => x.id === selRef.current)
    const next = i < 0 ? 0 : (i + 1) % p.length
    setRef.current(p[next].id)
  }, [])

  return { advance }
}
