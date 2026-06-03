/**
 * STV Kiosk service worker — offline precache.
 *
 * Goal: the kiosk loads ONCE while online (e.g. via a phone hotspot), then runs
 * fully offline for hours/days. Strategy is cache-first for every same-origin
 * GET: the first time a file is fetched (app shell, JS chunks, GLTF models,
 * textures) it is stored in Cache Storage and served from there forever after —
 * independent of the browser's volatile HTTP cache.
 *
 * The 3D models are NOT all fetched on first paint, so the app also runs a
 * background "warm-up" (see hooks/useModelWarmup.ts) that loads every model once
 * while online; each of those fetches passes through here and gets cached.
 *
 * UPDATING THE KIOSK: bump CACHE_VERSION below and redeploy. On activate the old
 * cache is purged and the new shell + assets are re-fetched on next online load.
 *
 * NOTE: a service worker only registers over HTTPS (or http://localhost). The
 * site MUST be served over TLS for offline to work.
 */

const CACHE_VERSION = 'v1'
const CACHE = `stv-kiosk-${CACHE_VERSION}`

self.addEventListener('install', () => {
  // Take over as soon as installed — no waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // ignore cross-origin (CDN/HDR/etc.)

  // SPA navigations: serve a cached document, fall back to network, then to the
  // cached index shell when fully offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const res = await fetch(req)
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        } catch {
          const shell =
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            (await cache.match('/index'))
          if (shell) return shell
          throw new Error('offline and no cached shell available')
        }
      })(),
    )
    return
  }

  // Everything else (JS chunks, CSS, GLTF/GLB, .bin, textures, icons): cache-first,
  // populating the cache on the first successful network fetch.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      if (cached) return cached
      const res = await fetch(req)
      // Cache only full, same-origin 200s. Skip 206 partials / opaque responses
      // (those would break when replayed offline).
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone())
      }
      return res
    })(),
  )
})
