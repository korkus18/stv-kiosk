'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'

import StvLion from '@/components/icons/StvLion'
import STVLogo from '@/components/ui/STVLogo'
import { AttractOverlay } from './AttractOverlay'
import { ProductDetailQr } from './ProductDetailQr'
import { ExplodeButton } from './ExplodeButton'
import { EmptyModelPlaceholder } from './EmptyModelPlaceholder'
import { CategoryFilter } from './CategoryFilter'
import { HudChip, type AnchorState } from './HudChip'
import { HudCube, type CubeState } from './HudCube'
import { InventoryOverlay } from './InventoryOverlay'
import { tokens } from './tokens'
import type { HudAnchor } from './KioskCanvas'

import type { Product } from '@/data/products'
import { PRODUCTS } from '@/data/products'
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

/** Portrait-only: pin the two top chips to opposite top corners of the hero
 *  area. (A previous fixed ±320px nudge only worked for elongated models — on
 *  compact ones the cube corners project near centre, so the nudge flung the
 *  chips mid-screen instead of seating them in the corners.) X is pinned to the
 *  edge; Y still tracks the cube corner (clamped to the hero). See HudChip.pinX. */
const PORTRAIT_PIN_X: Record<string, 'left' | 'right'> = {
  designation: 'right',
  type: 'left',
}

export function KioskPortrait({
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
  exploded,
  explodable,
  onToggleExplode,
  onExplodableChange,
}: KioskSharedProps) {
  const [inventoryOpen, setInventoryOpen] = useState(false)
  // Attract shows ONLY the model (+ touch prompt); active reveals the full
  // informed UI. Data chrome below is gated on this.
  const isActive = mode === 'active'
  // HUD chips are DOM-positioned — hide them while the QR modal is open
  // (z-index alone can't put the modal above their paint layer).
  const [qrOpen, setQrOpen] = useState(false)

  const currentIndex = useMemo(
    () => filteredProducts.findIndex((p) => p.id === selectedProductId),
    [filteredProducts, selectedProductId],
  )

  function goPrev() {
    if (filteredProducts.length === 0) return
    const next = currentIndex <= 0 ? filteredProducts.length - 1 : currentIndex - 1
    setSelectedProductId(filteredProducts[next].id)
  }

  function goNext() {
    if (filteredProducts.length === 0) return
    const next =
      currentIndex >= filteredProducts.length - 1 ? 0 : currentIndex + 1
    setSelectedProductId(filteredProducts[next].id)
  }

  // HUD chip state. In the narrow portrait viewport the two TOP chips
  // (DESIGNATION right, TYPE left) project too close to the centre and overlap,
  // so we PIN them to opposite top corners of the hero (pinX); their Y still
  // tracks the cube corner. The two bottom chips keep riding the cube.
  const chipValues = selectedProduct ? pickChipValues(selectedProduct) : []
  const hudAnchors: HudAnchor[] = HUD_ANCHOR_POSITIONS.map((anchor, i) => ({
    id: anchor.id,
    anchorPos: anchor.pos,
    label: chipValues[i]?.label ?? '',
    value: chipValues[i]?.value ?? '',
    align: anchor.align,
    pinX: PORTRAIT_PIN_X[anchor.id],
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

  const has3D = Boolean(selectedProduct?.model3D)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        height: '100vh',
        background: tokens.bg,
        color: tokens.text,
        fontFamily: 'Barlow, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* ── Lion watermark — top-left, bleeds off top + left edges ──────
          Portrait-only placement (landscape keeps its own right-edge style).
          Same un-flipped asset & colour; only repositioned + cropped by the
          viewport edges so the lion stays partial, never whole. Sits at
          zIndex 0 behind all UI (top bar / filter strip / HUD chips). */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '-26vw',
          left: '-32vw',
          height: '100vw',
          width: '100vw',
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

      {/* ── TOP BAR ──────────────────────────────────────────────────── */}
      <div
        style={{
          height: 80,
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          background: tokens.bgCard,
          borderBottom: `1px solid ${tokens.border}`,
          zIndex: 5,
          flexShrink: 0,
        }}
      >
        <STVLogo scale={1.1} />
      </div>

      {/* ── FILTER STRIP ─────────────────────────────────────────────── */}
      {isActive && (
        <div
          style={{
            padding: '20px 32px',
            background: tokens.bgCard,
            borderBottom: `1px solid ${tokens.border}`,
            zIndex: 4,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <CategoryFilter
            active={activeCategory}
            onChange={setActiveCategory}
          />
        </div>
      )}

      {/* ── HERO 3D AREA ────────────────────────────────────────────── */}
      <div
        style={{
          flex: '1 1 0',
          position: 'relative',
          minHeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {/* Left arrow */}
        {isActive && <NavArrow direction="left" onClick={goPrev} />}

        {/* 3D canvas or placeholder */}
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
              orientation="portrait"
              attract={!isActive}
              onModelError={onModelError}
              prefetchUrl={prefetchUrl}
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
                pinX={anchor.pinX}
                delay={anchor.delay}
                chipOffset={anchor.chipOffset}
                anchorStateRef={anchorStateRef}
                isMuted={focusedChipId !== null && focusedChipId !== anchor.id}
                isFocused={focusedChipId === anchor.id}
                onClick={() =>
                  setFocusedChipId((p) => (p === anchor.id ? null : anchor.id))
                }
              />
            ))}
          </AnimatePresence>
        )}

        {/* Right arrow */}
        {isActive && <NavArrow direction="right" onClick={goNext} />}

        {/* Position indicator */}
        {isActive && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: tokens.monoStack,
            fontSize: 13,
            letterSpacing: '0.18em',
            color: tokens.textSecondary,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: tokens.blue }}>
            {String(currentIndex + 1).padStart(2, '0')}
          </span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span>{String(filteredProducts.length).padStart(2, '0')}</span>
          <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
          <span>
            {
              getCategory(selectedProduct?.category ?? 'engineer').label
            }
          </span>
        </div>
        )}
      </div>

      {/* ── INFO PANEL ──────────────────────────────────────────────── */}
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.12 }}
          style={{
            padding: '40px 48px 32px',
            background: tokens.bg,
            position: 'relative',
            zIndex: 2,
            flexShrink: 0,
          }}
        >
          {selectedProduct && (
            <PortraitInfoPanel
              product={selectedProduct}
              onQrOpenChange={setQrOpen}
              explodable={explodable}
              exploded={exploded}
              onToggleExplode={onToggleExplode}
            />
          )}
        </motion.div>
      )}

      {/* ── PULL-UP TAB ─────────────────────────────────────────────── */}
      {isActive && (
      <button
        onClick={() => setInventoryOpen(true)}
        style={{
          height: 100,
          marginTop: 'auto',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: tokens.blue,
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
          zIndex: 3,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ChevronUp />
          Browse Inventory
        </span>
        <span
          style={{
            fontFamily: tokens.monoStack,
            fontSize: 13,
            opacity: 0.85,
            letterSpacing: '0.15em',
          }}
        >
          {PRODUCTS.length} products
        </span>
      </button>
      )}

      {/* ── INVENTORY OVERLAY ───────────────────────────────────────── */}
      <AnimatePresence>
        {isActive && inventoryOpen && (
          <InventoryOverlay
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            selectedProductId={selectedProductId}
            onSelect={(id) => {
              setSelectedProductId(id)
              setInventoryOpen(false)
            }}
            onClose={() => setInventoryOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Attract: full-viewport touch-anywhere catcher + prompt */}
      {!isActive && <AttractOverlay onActivate={onActivate} />}
    </div>
  )
}

function NavArrow({
  direction,
  onClick,
}: {
  direction: 'left' | 'right'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={direction === 'left' ? 'Previous product' : 'Next product'}
      style={{
        position: 'absolute',
        [direction === 'left' ? 'left' : 'right']: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#ffffff',
        border: `1px solid ${tokens.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: tokens.blue,
        zIndex: 6,
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
        padding: 0,
      }}
    >
      <svg
        width="26"
        height="26"
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
    </button>
  )
}

function ChevronUp() {
  return (
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
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

function PortraitInfoPanel({
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
  const categoryLabel = getCategory(product.category).label.toUpperCase()
  const desc =
    formatDescription(product.description) ||
    'Full specification available in the technical brief.'

  return (
    <>
      {/* Blue accent bar */}
      <div
        style={{
          height: 2,
          width: 48,
          background: tokens.blue,
          marginBottom: 20,
        }}
      />

      {/* Eyebrow */}
      <div
        style={{
          fontFamily: tokens.monoStack,
          fontSize: 12,
          letterSpacing: '0.25em',
          color: tokens.blue,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        Operational Data · {categoryLabel}
      </div>

      {/* Headline */}
      <h1
        style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: 'clamp(40px, 5.5vw, 56px)',
          fontWeight: 800,
          letterSpacing: '-0.01em',
          lineHeight: 0.95,
          color: tokens.text,
          textTransform: 'uppercase',
          margin: '0 0 14px',
          maxWidth: '95%',
          textWrap: 'balance',
        }}
      >
        {preventOrphan(product.name)}
      </h1>

      {/* Subtitle */}
      <div
        style={{
          fontFamily: tokens.monoStack,
          fontSize: 20,
          color: tokens.textSecondary,
          marginBottom: 24,
          letterSpacing: '0.03em',
        }}
      >
        {subtitle}
      </div>

      {/* NATO badge */}
      {product.natoStockNumber && (
        <div
          style={{
            padding: '12px 0',
            borderTop: `1px solid ${tokens.blueMuted}`,
            borderBottom: `1px solid ${tokens.divider}`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
            fontFamily: tokens.monoStack,
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.2em',
              color: tokens.blue,
              textTransform: 'uppercase',
            }}
          >
            NATO Stock No.
          </span>
          <span
            style={{
              fontSize: 14,
              color: tokens.text,
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}
          >
            {product.natoStockNumber}
          </span>
        </div>
      )}

      {/* Description */}
      <p
        style={{
          fontFamily: 'Barlow, sans-serif',
          fontSize: 16,
          lineHeight: 1.6,
          color: tokens.textSecondary,
          margin: '0 0 32px',
          maxWidth: '100%',
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
    </>
  )
}
