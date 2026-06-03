'use client'

import { useEffect, useRef, useState } from 'react'
import { GLTFLoader, MeshoptDecoder } from 'three-stdlib'
import type { GLTF } from 'three-stdlib'
import * as THREE from 'three'

import { gltfLoaderExtender } from '@/components/kiosk/KioskCanvas'
import { PRODUCTS, isVisible } from '@/data/products'

export interface WarmupProgress {
  /** Models fully fetched so far. */
  done: number
  /** Total models to warm. */
  total: number
  /** True once every model has been fetched (safe to go offline). */
  complete: boolean
}

/**
 * Background warm-up: while online, loads EVERY product model once so the
 * service worker (public/sw.js) caches each GLTF/GLB + its .bin + textures. After
 * this completes the kiosk has all ~338 MB of assets cached and runs fully
 * offline.
 *
 * Why a real GLTFLoader (not just fetch of the .gltf): a .gltf references its
 * .bin + textures by relative URI. Driving the SAME loader the canvas uses
 * (gltfLoaderExtender — identical `#`→`%23` URL handling) guarantees the warm-up
 * requests are byte-identical to the canvas's later requests, so the SW cache
 * keys match exactly (filenames here contain `#`, spaces and diacritics).
 *
 * Models are loaded ONE AT A TIME and immediately disposed (geometry + textures
 * freed) — the bytes live on in the SW HTTP cache, but nothing accumulates in
 * GPU/JS memory, so a 24/7 kiosk stays lean. Runs once per page load; on a warm
 * load every request is a cache hit and finishes almost instantly.
 */
export function useModelWarmup(enabled = true): WarmupProgress {
  const [progress, setProgress] = useState<WarmupProgress>({
    done: 0,
    total: 0,
    complete: false,
  })
  const started = useRef(false)

  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true

    const urls = Array.from(
      new Set(
        PRODUCTS.filter((p) => isVisible(p) && p.model3D).map(
          (p) => p.model3D as string,
        ),
      ),
    )

    if (urls.length === 0) {
      setProgress({ done: 0, total: 0, complete: true })
      return
    }

    setProgress({ done: 0, total: urls.length, complete: false })

    let cancelled = false
    const loader = new GLTFLoader()
    gltfLoaderExtender(loader)
    // Several models are Meshopt-compressed (.glb). drei's useGLTF wires up the
    // Meshopt decoder automatically; this standalone loader must do the same or
    // those models throw on parse ("setMeshoptDecoder must be called…"). Mirror
    // drei's exact call. (No model uses Draco, so no DRACOLoader needed — and it
    // would only add a cross-origin decoder dependency.)
    loader.setMeshoptDecoder(
      typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder,
    )

    const dispose = (gltf: GLTF) => {
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = mesh.material
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : []
        for (const m of mats) {
          for (const key of Object.keys(m)) {
            const val = (m as unknown as Record<string, unknown>)[key]
            if (val && (val as THREE.Texture).isTexture) {
              ;(val as THREE.Texture).dispose()
            }
          }
          m.dispose()
        }
      })
    }

    ;(async () => {
      let done = 0
      for (const url of urls) {
        if (cancelled) return
        try {
          const gltf = await loader.loadAsync(url)
          dispose(gltf)
        } catch (err) {
          // A broken/missing model shouldn't stall warm-up — count it and move on.
          console.warn('[warmup] failed to preload', url, err)
        }
        done += 1
        if (!cancelled) {
          setProgress({ done, total: urls.length, complete: done >= urls.length })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])

  return progress
}
