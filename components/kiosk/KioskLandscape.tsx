'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'

import StvLion from '@/components/icons/StvLion'
import STVLogo from '@/components/ui/STVLogo'
import { AttractOverlay } from './AttractOverlay'
import { ProductDetailQr } from './ProductDetailQr'
import { ExplodeButton } from './ExplodeButton'
import { EmptyModelPlaceholder } from './EmptyModelPlaceholder'
import { CategoryFilter } from './CategoryFilter'
import { InventorySidebar } from './InventorySidebar'
import { HudChip, type AnchorState } from './HudChip'
import { HudCube, type CubeState } from './HudCube'
import { tokens } from './tokens'
import type { HudAnchor } from './KioskCanvas'

import type { Product } from '@/data/products'
import { getCategory } from '@/data/categories'

import {
  HUD_ANCHOR_POSITIONS,
  formatDescription,
  getSubtitle,
  pickChipValues,
  preventOrphan,
  type KioskSharedProps,
} from './utils'

const KioskCanvas = dynamic(
  () =>
    import('./KioskCanvas').then((m) => m.KioskCanvas),
  {
    ssr: false,
    loading: () => <div style={{ width: '100%', height: '100%' }} />,
  },
)

export function KioskLandscape({
  activeCategory,
  setActiveCategory,
  selectedProductId,
  setSelectedProductId,
  selectedProduct,
  filteredProducts,
  mode,
  onActivate,
  onModelError,
  prefetchUrl,
  attractExplode,
  onAttractAdvance,
  modelRotation,
  exploded,
  explodable,
  onToggleExplode,
  onExplodableChange,
}: KioskSharedProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Attract shows ONLY the model (+ touch prompt); active reveals the full
  // informed UI. Data chrome below is gated on this.
  const isActive = mode === 'active'
  // HUD chips are DOM-positioned (their own paint layer), so the QR modal can't
  // out-z-index them — hide them outright while the modal is open.
  const [qrOpen, setQrOpen] = useState(false)

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveCategory('all')
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const idx = filteredProducts.findIndex((p) => p.id === selectedProductId)
      if (idx < 0) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next =
        filteredProducts[
          (idx + delta + filteredProducts.length) % filteredProducts.length
        ]
      if (next) {
        e.preventDefault()
        setSelectedProductId(next.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredProducts, selectedProductId, setActiveCategory, setSelectedProductId])

  const chipValues = selectedProduct ? pickChipValues(selectedProduct) : []
  const hudAnchors: HudAnchor[] = HUD_ANCHOR_POSITIONS.map((anchor, i) => ({
    id: anchor.id,
    anchorPos: anchor.pos,
    label: chipValues[i]?.label ?? '',
    value: chipValues[i]?.value ?? '',
    align: anchor.align,
    delay: anchor.delay,
    chipOffset: anchor.chipOffset,
  }))

  const anchorStateRef = useRef<Record<string, AnchorState>>({
    designation: { x: 0, y: 0, visible: false, z: 0 },
    type:        { x: 0, y: 0, visible: false, z: 0 },
    metric:      { x: 0, y: 0, visible: false, z: 0 },
    status:      { x: 0, y: 0, visible: false, z: 0 },
  })

  const cubeStateRef = useRef<Record<string, CubeState>>({})

  const [focusedChipId, setFocusedChipId] = useState<string | null>(null)
  useEffect(() => {
    setFocusedChipId(null)
  }, [selectedProductId])

  const handleChipClick = (id: string) =>
    setFocusedChipId((prev) => (prev === id ? null : id))

  const has3D = Boolean(selectedProduct?.model3D)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: tokens.bg,
        color: tokens.text,
        fontFamily: 'Barlow, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: tokens.topBarHeight,
          background: tokens.bgCard,
          borderBottom: `1px solid ${tokens.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          zIndex: 5,
          gap: 24,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            overflowX: 'auto',
          }}
        >
          {isActive && (
            <CategoryFilter active={activeCategory} onChange={setActiveCategory} />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <STVLogo scale={1.0} />
        </div>
      </div>

      {/* ── MAIN AREA ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: tokens.topBarHeight,
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
        }}
      >
        {isActive && (
          <InventorySidebar
            products={filteredProducts}
            activeCategory={activeCategory}
            selectedProductId={selectedProductId}
            onSelect={setSelectedProductId}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        )}

        <div
          style={{
            flex: 1,
            position: 'relative',
            background: tokens.bg,
            overflow: 'hidden',
          }}
        >
          {/* Lion watermark — viewport-anchored */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: '50%',
              right: '-70vh',
              transform: 'translateY(-50%)',
              height: '115vh',
              width: '115vh',
              opacity: 0.07,
              color: tokens.blue,
              pointerEvents: 'none',
              zIndex: 0,
              overflow: 'visible',
            }}
          >
            <StvLion
              aria-hidden
              style={{ width: '100%', height: '100%', color: 'inherit' }}
            />
          </div>

          {/* 3D canvas OR placeholder */}
          {selectedProduct && has3D ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
              }}
            >
              <KioskCanvas
                anchors={hudAnchors}
                anchorStateRef={anchorStateRef}
                cubeStateRef={cubeStateRef}
                modelUrl={selectedProduct.model3D ?? undefined}
                orientation="landscape"
                attract={!isActive}
                onModelError={onModelError}
                prefetchUrl={prefetchUrl}
                attractExplode={attractExplode}
                onAttractAdvance={onAttractAdvance}
                modelRotation={selectedProduct.modelRotation}
                exploded={exploded}
                explodeConfig={selectedProduct.explode}
                onExplodableChange={onExplodableChange}
              />
            </div>
          ) : selectedProduct ? (
            <EmptyModelPlaceholder
              productName={selectedProduct.name}
              variant="gallery"
            />
          ) : null}

          {/* Imaginary cube wireframe + leader lines (rotate with the model) */}
          {isActive && !qrOpen && has3D && selectedProduct && (
            <HudCube ids={hudAnchors.map((a) => a.id)} cubeStateRef={cubeStateRef} />
          )}

          {/* HUD chips */}
          {isActive && !qrOpen && has3D && selectedProduct && (
            <AnimatePresence>
              {hudAnchors.map((anchor) => (
                <HudChip
                  key={`${selectedProduct.id}-${anchor.id}`}
                  id={anchor.id}
                  label={anchor.label}
                  value={anchor.value}
                  align={anchor.align}
                  delay={anchor.delay}
                  chipOffset={anchor.chipOffset}
                  anchorStateRef={anchorStateRef}
                  isMuted={focusedChipId !== null && focusedChipId !== anchor.id}
                  isFocused={focusedChipId === anchor.id}
                  onClick={() => handleChipClick(anchor.id)}
                />
              ))}
            </AnimatePresence>
          )}

          {isActive && selectedProduct && (
            <RightInfoPanel
              product={selectedProduct}
              onQrOpenChange={setQrOpen}
              explodable={explodable}
              exploded={exploded}
              onToggleExplode={onToggleExplode}
            />
          )}
        </div>
      </div>

      {/* Attract: full-viewport touch-anywhere catcher + prompt */}
      {!isActive && <AttractOverlay onActivate={onActivate} />}
    </div>
  )
}

function RightInfoPanel({
  product,
  onQrOpenChange,
  explodable,
  exploded,
  onToggleExplode,
}: {
  product: Product
  onQrOpenChange?: (open: boolean) => void
  explodable: boolean
  exploded: boolean
  onToggleExplode: () => void
}) {
  const subtitle = getSubtitle(product)
  const catLabel = getCategory(product.category).label
  const desc =
    formatDescription(product.description) ||
    'Full specification available in the technical brief.'

  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.12 }}
      style={{
        position: 'absolute',
        right: 100,
        bottom: 40,
        width: 460,
        maxWidth: '42%',
        zIndex: 3,
      }}
    >
      <div
        style={{
          height: 2,
          width: 40,
          background: tokens.blue,
          marginBottom: 16,
        }}
      />

      <div
        style={{
          fontFamily: tokens.monoStack,
          fontSize: 10,
          letterSpacing: '0.25em',
          color: tokens.blue,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Operational Data · {catLabel}
      </div>

      <h1
        style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: 'clamp(32px, 3.6vw, 48px)',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 0.95,
          color: tokens.text,
          textTransform: 'uppercase',
          margin: '0 0 10px',
          textWrap: 'balance',
        }}
      >
        {preventOrphan(product.name)}
      </h1>

      <div
        style={{
          fontFamily: tokens.monoStack,
          fontSize: 15,
          color: tokens.textSecondary,
          marginBottom: 20,
          letterSpacing: '0.04em',
        }}
      >
        {subtitle}
      </div>

      {product.natoStockNumber && (
        <div
          style={{
            padding: '10px 0',
            borderTop: `1px solid ${tokens.blueMuted}`,
            borderBottom: `1px solid ${tokens.divider}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            fontFamily: tokens.monoStack,
          }}
        >
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: tokens.blue,
              textTransform: 'uppercase',
            }}
          >
            NATO Stock No.
          </span>
          <span
            style={{
              fontSize: 13,
              color: tokens.text,
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}
          >
            {product.natoStockNumber}
          </span>
        </div>
      )}

      <p
        style={{
          fontFamily: 'Barlow, sans-serif',
          fontSize: 14,
          lineHeight: 1.6,
          color: tokens.textSecondary,
          margin: '0 0 28px',
          maxWidth: '52ch',
        }}
      >
        {desc}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ExplodeButton
          explodable={explodable}
          exploded={exploded}
          onToggle={onToggleExplode}
        />
        <ProductDetailQr product={product} onOpenChange={onQrOpenChange} />
      </div>
    </motion.div>
  )
}
