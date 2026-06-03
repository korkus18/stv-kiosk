'use client'

import { useEffect } from 'react'

/**
 * Registers the offline service worker (public/sw.js) on mount. Rendered once,
 * app-wide, from the root layout. No UI.
 *
 * The SW only registers over HTTPS or http://localhost — over plain http it is
 * silently unavailable (the kiosk then falls back to the volatile browser HTTP
 * cache, i.e. no reliable offline). Failures are logged, never thrown.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[sw] registration failed (offline cache unavailable):', err)
    })
  }, [])

  return null
}
