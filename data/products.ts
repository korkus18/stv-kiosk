import productsJson from './products.json'
import type { CategoryId } from './categories'

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
}

export const PRODUCTS: Product[] = productsJson as unknown as Product[]

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}

export function getProductsByCategory(
  category: CategoryId | 'all',
): Product[] {
  if (category === 'all') return PRODUCTS
  return PRODUCTS.filter((p) => p.category === category)
}

export type CategoryCounts = Record<CategoryId | 'all', number>

export function countByCategory(): CategoryCounts {
  const counts: Record<string, number> = { all: PRODUCTS.length }
  for (const p of PRODUCTS) {
    counts[p.category] = (counts[p.category] || 0) + 1
  }
  return counts as CategoryCounts
}
