'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  PRODUCTS,
  getProductById,
  getProductsByCategory,
} from '@/data/products'
import type { CategoryId } from '@/data/categories'
import { useOrientation } from '@/hooks/useOrientation'
import { KioskLandscape } from '@/components/kiosk/KioskLandscape'
import { KioskPortrait } from '@/components/kiosk/KioskPortrait'
import type { KioskSharedProps } from '@/components/kiosk/utils'

export default function KioskPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all')
  const [selectedProductId, setSelectedProductId] = useState<string>(
    PRODUCTS[0]?.id ?? '',
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

  const sharedProps: KioskSharedProps = {
    activeCategory,
    setActiveCategory,
    selectedProductId,
    setSelectedProductId,
    selectedProduct,
    filteredProducts,
  }

  return orientation === 'portrait' ? (
    <KioskPortrait {...sharedProps} />
  ) : (
    <KioskLandscape {...sharedProps} />
  )
}
