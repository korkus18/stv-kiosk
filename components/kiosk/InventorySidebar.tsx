'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '@/data/products'
import type { CategoryId } from '@/data/categories'
import { CATEGORIES } from '@/data/categories'
import { tokens } from './tokens'

type Props = {
  products: Product[]
  activeCategory: CategoryId | 'all'
  selectedProductId: string | null
  onSelect: (id: string) => void
  isOpen: boolean
  onToggle: () => void
}

export function InventorySidebar({
  products,
  activeCategory,
  selectedProductId,
  onSelect,
  isOpen,
  onToggle,
}: Props) {
  return (
    <motion.aside
      animate={{ width: isOpen ? tokens.sidebarOpenWidth : tokens.sidebarClosedWidth }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        height: '100%',
        background: tokens.bgCard,
        borderRight: `1px solid ${tokens.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'space-between' : 'center',
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                fontFamily: tokens.monoStack,
                fontSize: 11,
                letterSpacing: '0.2em',
                color: tokens.textMuted,
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
              }}
            >
              <span>Inventory</span>
              <span style={{ color: tokens.blue, fontWeight: 600 }}>{products.length}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={onToggle}
          aria-label={isOpen ? 'Close inventory' : 'Open inventory'}
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: tokens.textMuted,
            padding: 0,
          }}
        >
          <ChevronIcon direction={isOpen ? 'left' : 'right'} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ flex: 1, overflowY: 'auto' }}
          >
            <InventoryGroupedList
              products={products}
              activeCategory={activeCategory}
              selectedProductId={selectedProductId}
              onSelect={onSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes inventoryPulseDot {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        .inventory-pulse-dot {
          animation: inventoryPulseDot 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .inventory-pulse-dot {
            animation: none;
          }
        }
      `}</style>
    </motion.aside>
  )
}

function InventoryGroupedList({
  products,
  activeCategory,
  selectedProductId,
  onSelect,
}: {
  products: Product[]
  activeCategory: CategoryId | 'all'
  selectedProductId: string | null
  onSelect: (id: string) => void
}) {
  if (activeCategory !== 'all') {
    let index = 0
    return (
      <div>
        {products.map((p) => (
          <InventoryItem
            key={p.id}
            product={p}
            index={++index}
            active={p.id === selectedProductId}
            onClick={() => onSelect(p.id)}
          />
        ))}
      </div>
    )
  }

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: products.filter((p) => p.category === cat.id),
  })).filter((g) => g.items.length > 0)

  let globalIndex = 0
  return (
    <div>
      {grouped.map(({ cat, items }) => (
        <div key={cat.id}>
          <div
            style={{
              padding: '14px 20px 8px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              background: 'transparent',
              borderBottom: `1px solid ${tokens.dividerStrong}`,
              borderTop: `1px solid ${tokens.divider}`,
            }}
          >
            <span
              style={{
                fontFamily: tokens.monoStack,
                fontSize: 10,
                letterSpacing: '0.18em',
                color: tokens.textMuted,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {cat.label}
            </span>
            <span
              style={{
                fontFamily: tokens.monoStack,
                fontSize: 10,
                color: tokens.textMuted,
              }}
            >
              {items.length}
            </span>
          </div>
          {items.map((p) => (
            <InventoryItem
              key={p.id}
              product={p}
              index={++globalIndex}
              active={p.id === selectedProductId}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function InventoryItem({
  product,
  index,
  active,
  onClick,
}: {
  product: Product
  index: number
  active: boolean
  onClick: () => void
}) {
  const hasModel = Boolean(product.model3D)
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 20px',
        background: active ? '#0072bc' : 'transparent',
        borderLeft: active ? '4px solid #042c53' : '4px solid transparent',
        borderRight: 'none',
        borderTop: 'none',
        borderBottom: `1px solid ${tokens.divider}`,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'block',
        transition: 'background 150ms ease',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: tokens.monoStack,
          fontSize: 10,
          color: active ? 'rgba(255,255,255,0.85)' : tokens.textMuted,
          letterSpacing: '0.15em',
          marginBottom: 4,
        }}
      >
        <span>#{String(index).padStart(3, '0')}</span>
        <span
          className={active && hasModel ? 'inventory-pulse-dot' : ''}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: hasModel
              ? active
                ? '#86efac'
                : '#22c55e'
              : active
                ? 'rgba(255,255,255,0.4)'
                : '#d4d4d8',
            display: 'inline-block',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: active ? '#ffffff' : tokens.textSecondary,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          lineHeight: 1.3,
        }}
      >
        {product.name}
      </div>
    </button>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  )
}
