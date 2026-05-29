'use client'

import { useEffect, useState } from 'react'

export type Orientation = 'portrait' | 'landscape'

/**
 * Reports the current viewport orientation. Returns 'landscape' during SSR
 * and the first client render, then updates after mount. Listens to both
 * `resize` (covers browser window changes) and `orientationchange` (covers
 * device rotation on touch hardware).
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('landscape')

  useEffect(() => {
    const check = () => {
      const isPortrait = window.innerHeight > window.innerWidth
      setOrientation(isPortrait ? 'portrait' : 'landscape')
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return orientation
}
