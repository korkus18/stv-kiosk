'use client'

import { motion } from 'framer-motion'
import { getProductsByCategory, type Product } from '@/data/products'
import { CATEGORIES } from '@/data/categories'
import type { CategoryId } from '@/data/categories'
import { CategoryFilter } from './CategoryFilter'
import { tokens } from './tokens'

type Props = {
  activeCategory: CategoryId | 'all'
  setActiveCategory: (id: CategoryId | 'all') => void
  selectedProductId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function InventoryOverlay({
  activeCategory,
  setActiveCategory,
  selectedProductId,
  onSelect,
  onClose,
}: Props) {
  const filteredProducts = getProductsByCategory(activeCategory)
  const showGrouping = activeCategory === 'all'

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      style={{
        position: 'fixed',
        inset: 0,
        background: tokens.bgCard,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 14,
            letterSpacing: '0.2em',
            color: tokens.text,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Inventory
          <span style={{ color: tokens.blue, marginLeft: 10 }}>
            {filteredProducts.length}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inventory"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'transparent',
            border: `1px solid ${tokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: tokens.textMuted,
            padding: 0,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Filter inside overlay */}
      <div
        style={{
          padding: '20px 32px',
          background: tokens.bg,
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <CategoryFilter active={activeCategory} onChange={setActiveCategory} />
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {showGrouping
          ? CATEGORIES.map((cat) => {
              const items = getProductsByCategory(cat.id)
              if (items.length === 0) return null
              return (
                <div key={cat.id}>
                  <div
                    style={{
                      padding: '20px 32px 10px',
                      fontFamily: tokens.monoStack,
                      fontSize: 12,
                      letterSpacing: '0.2em',
                      color: tokens.textMuted,
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      borderTop: `1px solid ${tokens.divider}`,
                      background: tokens.bg,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span>{cat.label}</span>
                    <span>{items.length}</span>
                  </div>
                  {items.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      selected={p.id === selectedProductId}
                      onClick={() => onSelect(p.id)}
                    />
                  ))}
                </div>
              )
            })
          : filteredProducts.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                selected={p.id === selectedProductId}
                onClick={() => onSelect(p.id)}
              />
            ))}
      </div>
    </motion.div>
  )
}

function ProductRow({
  product,
  selected,
  onClick,
}: {
  product: Product
  selected: boolean
  onClick: () => void
}) {
  const hasModel = Boolean(product.model3D)
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '20px 32px',
        background: selected ? '#0072bc' : 'transparent',
        borderLeft: selected ? '4px solid #042c53' : '4px solid transparent',
        borderRight: 'none',
        borderTop: 'none',
        borderBottom: `1px solid ${tokens.divider}`,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'block',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 11,
            letterSpacing: '0.15em',
            color: selected ? 'rgba(255,255,255,0.85)' : tokens.textMuted,
          }}
        >
          {product.id.toUpperCase().substring(0, 12)}
        </span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: hasModel
              ? selected
                ? '#86efac'
                : '#22c55e'
              : selected
                ? 'rgba(255,255,255,0.4)'
                : '#d4d4d8',
            display: 'inline-block',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: selected ? 600 : 500,
          color: selected ? '#ffffff' : tokens.text,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {product.name}
      </div>
    </button>
  )
}
