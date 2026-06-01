import productsJson from './products.json'
import type { CategoryId } from './categories'

/** Per-model exploded-view tuning (all fields optional — auto defaults apply). */
export type ExplodeConfig = {
  mode?: 'axial' | 'radial'
  distance?: number
  axisOverride?: 'x' | 'y' | 'z'
  /** Explicit local offset for a single node where the auto direction fails. */
  partOverrides?: Record<string, [number, number, number]>
}
/** `false` = force-off; object = tune; absent = auto (axial, default distance). */
export type ExplodeField = boolean | ExplodeConfig


export type Product = {
  id: string
  category: CategoryId
  categoryLabel: string
  name: string
  description: string | null
  compatibility: string | null
  natoStockNumber: string | null
  specs: Record<string, string>
  model3D: string | null
  /**
   * Admin-editable display flags (defaults applied if absent):
   * - `visible` (default true): false hides the product EVERYWHERE — inventory
   *   list, attract/touch loop, and category counts.
   * - `featured` (default false): when at least one VISIBLE product is featured,
   *   the attract loop plays only featured ones; otherwise all visible ones.
   * - `webUrl` (default null): QR target. null → no "Detail"/QR button.
   */
  visible?: boolean
  featured?: boolean
  webUrl?: string | null
  /** Exploded view: absent = auto if model has ≥2 parts; false = force-off. */
  explode?: ExplodeField
}

export const PRODUCTS: Product[] = productsJson as unknown as Product[]

/** Hidden everywhere unless explicitly `visible !== false` (default = visible). */
export function isVisible(p: Product): boolean {
  return p.visible !== false
}

/** All products the kiosk should surface (visible ones), in source order. */
export const VISIBLE_PRODUCTS: Product[] = PRODUCTS.filter(isVisible)

export function getProductById(id: string): Product | undefined {
  // Resolves any product by id (even hidden) — selection plumbing relies on it.
  return PRODUCTS.find((p) => p.id === id)
}

export function getProductsByCategory(
  category: CategoryId | 'all',
): Product[] {
  if (category === 'all') return VISIBLE_PRODUCTS
  return VISIBLE_PRODUCTS.filter((p) => p.category === category)
}

export type CategoryCounts = Record<CategoryId | 'all', number>

export function countByCategory(): CategoryCounts {
  // Counts only visible products so the filter chips match what's shown.
  const counts: Record<string, number> = { all: VISIBLE_PRODUCTS.length }
  for (const p of VISIBLE_PRODUCTS) {
    counts[p.category] = (counts[p.category] || 0) + 1
  }
  return counts as CategoryCounts
}
