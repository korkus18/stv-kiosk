'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  PRODUCTS,
  getProductById,
  getProductsByCategory,
  isVisible,
} from '@/data/products'
import type { Product } from '@/data/products'
import type { CategoryId } from '@/data/categories'
import { useOrientation } from '@/hooks/useOrientation'
import { useKioskMode } from '@/hooks/useKioskMode'
import { useAttractLoop } from '@/hooks/useAttractLoop'
import { useModelWarmup } from '@/hooks/useModelWarmup'
import { KioskLandscape } from '@/components/kiosk/KioskLandscape'
import { KioskPortrait } from '@/components/kiosk/KioskPortrait'
import { OfflineReadyIndicator } from '@/components/OfflineReadyIndicator'
import type { KioskSharedProps } from '@/components/kiosk/utils'

/** Attract defaults the kiosk returns to after a visitor leaves. */
const ATTRACT_DEFAULT_CATEGORY: CategoryId | 'all' = 'all'

/**
 * Products the attract loop may show: those with a model, minus any that failed
 * to load. Data-driven — if any product is `featured`, the loop plays ONLY
 * featured ones; otherwise it plays all playable products.
 */
function computeAttractPool(broken: ReadonlySet<string>): Product[] {
  const playable = PRODUCTS.filter(
    (p) => isVisible(p) && p.model3D && !broken.has(p.id),
  )
  const featured = playable.filter((p) => p.featured)
  return featured.length > 0 ? featured : playable
}

export default function KioskPage() {
  // Models that failed to load at runtime — excluded from the attract pool.
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const attractPool = useMemo(
    () => computeAttractPool(brokenIds),
    [brokenIds],
  )
  const attractDefaultId = attractPool[0]?.id ?? PRODUCTS[0]?.id ?? ''

  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>(
    ATTRACT_DEFAULT_CATEGORY,
  )
  const [selectedProductId, setSelectedProductId] = useState<string>(
    attractDefaultId,
  )

  const filteredProducts = useMemo(
    () => getProductsByCategory(activeCategory),
    [activeCategory],
  )

  const selectedProduct =
    getProductById(selectedProductId) ?? filteredProducts[0]

  useEffect(() => {
    if (
      activeCategory !== 'all' &&
      selectedProduct &&
      selectedProduct.category !== activeCategory
    ) {
      const first = filteredProducts[0]
      if (first) setSelectedProductId(first.id)
    }
  }, [activeCategory, filteredProducts, selectedProduct])

  // Hide the Next.js dev-mode indicator while the kiosk is active. Production
  // builds never render it, so this is a dev-only cosmetic. CSS rule lives
  // in app/globals.css.
  useEffect(() => {
    document.body.classList.add('hide-next-dev-indicator')
    return () => {
      document.body.classList.remove('hide-next-dev-indicator')
    }
  }, [])

  const orientation = useOrientation()

  // Background offline warm-up: load every model once (while online) so the
  // service worker caches all assets — after this the kiosk runs fully offline.
  const warmup = useModelWarmup()

  // State machine lives here, above the layout components, so attract/active
  // behave identically in both orientations. On reset we wipe the previous
  // visitor's category filter, but KEEP the currently shown model so the attract
  // loop resumes FROM it (continuing to the next pool item) rather than snapping
  // back to the first. If that model isn't in the attract pool (no 3D / not
  // featured), useAttractLoop falls back to pool[0]. Exploded view resets via
  // the `mode !== 'active'` effect below; camera/zoom reset is owned by the canvas.
  const { mode, activate, resetToAttract } = useKioskMode({
    onReset: () => {
      setActiveCategory(ATTRACT_DEFAULT_CATEGORY)
    },
  })
  void resetToAttract // exposed for later steps (e.g. an explicit exit button)

  // Attract auto-cycle. Advancement is event-driven: the canvas calls
  // `advance` once the current model has loaded, played its (optional) flourish,
  // and dwelled. Prefetch/dispose live in KioskCanvas.
  const { advance: attractAdvance } = useAttractLoop({
    enabled: mode === 'attract',
    pool: attractPool,
    selectedId: selectedProductId,
    setSelectedId: setSelectedProductId,
  })

  // Exploded-view state lives above both layouts. `explodable` is reported by
  // the canvas once a model loads; reset both whenever the product changes or
  // we leave active so a new model always starts assembled.
  const [exploded, setExploded] = useState(false)
  const [explodable, setExplodable] = useState(false)
  useEffect(() => {
    setExploded(false)
    setExplodable(false)
  }, [selectedProductId])
  useEffect(() => {
    if (mode !== 'active') setExploded(false)
  }, [mode])

  // A model that throws on load is marked broken so the loop skips it forever.
  const onModelError = useCallback((url: string) => {
    const product = PRODUCTS.find((p) => p.model3D === url)
    console.warn('[attract] model failed to load, skipping:', url)
    if (!product) return
    setBrokenIds((prev) => {
      if (prev.has(product.id)) return prev
      const next = new Set(prev)
      next.add(product.id)
      return next
    })
  }, [])

  // One-time log of products the attract loop will never show (no model).
  useEffect(() => {
    const noModel = PRODUCTS.filter((p) => !p.model3D)
    if (noModel.length > 0) {
      console.info(
        `[attract] ${noModel.length} product(s) skipped (no 3D model):`,
        noModel.map((p) => p.id),
      )
    }
  }, [])

  // Prefetch the NEXT attract model for a seamless crossfade (attract only).
  const prefetchUrl = useMemo(() => {
    if (mode !== 'attract' || attractPool.length <= 1) return undefined
    const i = attractPool.findIndex((p) => p.id === selectedProductId)
    const next = attractPool[(Math.max(i, 0) + 1) % attractPool.length]
    return next?.model3D ?? undefined
  }, [mode, attractPool, selectedProductId])

  const sharedProps: KioskSharedProps = {
    activeCategory,
    setActiveCategory,
    selectedProductId,
    setSelectedProductId,
    selectedProduct,
    filteredProducts,
    mode,
    onActivate: activate,
    onModelError,
    prefetchUrl,
    // Enabled for ALL models by default; the flourish still only plays on models
    // that are actually explodable (others gracefully just rotate). Opt a single
    // model OUT with `attractExplode: false` in products.json.
    attractExplode: selectedProduct?.attractExplode ?? true,
    onAttractAdvance: attractAdvance,
    modelRotation: selectedProduct?.modelRotation,
    exploded,
    explodable,
    onToggleExplode: () => setExploded((e) => !e),
    onExplodableChange: setExplodable,
  }

  return (
    <>
      {orientation === 'portrait' ? (
        <KioskPortrait {...sharedProps} />
      ) : (
        <KioskLandscape {...sharedProps} />
      )}
      <OfflineReadyIndicator progress={warmup} />
    </>
  )
}
