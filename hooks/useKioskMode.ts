'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Kiosk interaction mode.
 * - `attract`: idle, default. Auto-cycles models, lures from a distance.
 * - `active`:  a visitor touched the screen — full informed UI, user controls.
 *
 * The state machine is orientation-agnostic: it lives ABOVE the layout
 * components (in `app/page.tsx`) and is consumed by both KioskLandscape and
 * KioskPortrait through KioskSharedProps.
 */
export type KioskMode = 'attract' | 'active'

/** Inactivity (no interaction of any kind) before active → attract reset. */
export const DEFAULT_IDLE_RESET_MS = 45_000

/**
 * Any of these window events, while in `active`, counts as "the visitor is
 * still here" and re-arms the inactivity timer. Covers touch (kiosk), pointer
 * (drag), wheel/pinch and keyboard.
 */
const INTERACTION_EVENTS = [
  'pointerdown',
  'pointermove',
  'wheel',
  'keydown',
  'touchstart',
  'touchmove',
] as const

export interface UseKioskModeOptions {
  /** Inactivity window before resetting to attract (ms). */
  idleResetMs?: number
  /** Called when the kiosk resets to attract (clear product/category/zoom). */
  onReset?: () => void
  /** Called when the kiosk activates (freeze current model, open product). */
  onActivate?: () => void
}

export interface UseKioskMode {
  mode: KioskMode
  /** Enter active mode (e.g. on touch-anywhere in attract). */
  activate: () => void
  /** Force a return to attract (e.g. idle timeout). */
  resetToAttract: () => void
}

export function useKioskMode(options: UseKioskModeOptions = {}): UseKioskMode {
  const idleResetMs = options.idleResetMs ?? DEFAULT_IDLE_RESET_MS

  const [mode, setMode] = useState<KioskMode>('attract')

  // Keep callbacks in refs so the interaction-listener effect doesn't need
  // them as dependencies (and so it doesn't re-bind on every parent render).
  const onResetRef = useRef(options.onReset)
  const onActivateRef = useRef(options.onActivate)
  onResetRef.current = options.onReset
  onActivateRef.current = options.onActivate

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetToAttract = useCallback(() => {
    clearTimer()
    setMode('attract')
    onResetRef.current?.()
  }, [clearTimer])

  const activate = useCallback(() => {
    setMode((m) => (m === 'active' ? m : 'active'))
    onActivateRef.current?.()
  }, [])

  // Inactivity timer + interaction listeners are live ONLY in active mode.
  // Attract mode has no reset timer (it just loops on its own).
  useEffect(() => {
    if (mode !== 'active') return

    const arm = () => {
      clearTimer()
      timerRef.current = setTimeout(resetToAttract, idleResetMs)
    }

    arm()
    for (const evt of INTERACTION_EVENTS) {
      window.addEventListener(evt, arm, { passive: true })
    }
    return () => {
      for (const evt of INTERACTION_EVENTS) {
        window.removeEventListener(evt, arm)
      }
      clearTimer()
    }
  }, [mode, idleResetMs, clearTimer, resetToAttract])

  return { mode, activate, resetToAttract }
}
