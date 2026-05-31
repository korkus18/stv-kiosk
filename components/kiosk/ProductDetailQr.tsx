'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import type { Product } from '@/data/products'
import { tokens } from './tokens'

/**
 * "Detail" button + QR modal for a product (active mode, both orientations).
 *
 * - Renders NOTHING when the product has no `webUrl` (no way out except QR, and
 *   no QR target → no button).
 * - The QR is generated entirely client-side (qrcode.react → inline SVG), so it
 *   works fully offline. Target = `webUrl` + UTM tags.
 * - Modal shows ONLY the QR + product name + a scan prompt. No email, no PDF.
 */
export function ProductDetailQr({
  product,
  onOpenChange,
}: {
  product: Product
  /** Notifies the layout so it can hide HUD chips while the modal is open. */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const setOpenNotify = (v: boolean) => {
    setOpen(v)
    onOpenChange?.(v)
  }
  // Safety: if this product/button ever unmounts while open, tell the layout.
  useEffect(() => () => onOpenChange?.(false), [onOpenChange])

  if (!product.webUrl) return null
  const qrValue = withUtm(product.webUrl)

  return (
    <>
      <button
        onClick={() => setOpenNotify(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 20px',
          background: tokens.blue,
          color: tokens.textOnBlue,
          border: 'none',
          cursor: 'pointer',
          fontFamily: tokens.monoStack,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <QrGlyph />
        Detail
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="qr-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpenNotify(false)}
                style={{
                  // Portalled to <body> + above EVERY kiosk layer (chips z5,
                  // logo, sidebar, filter, zoom controls, attract overlay z50).
                  position: 'fixed',
                  inset: 0,
                  zIndex: 1000,
                  background: 'rgba(8, 9, 12, 0.86)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
            <motion.div
              key="qr-card"
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`${product.name} — QR detail`}
              style={{
                position: 'relative',
                background: tokens.bgCard,
                border: `1px solid ${tokens.border}`,
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.28)',
                padding: '40px 44px 36px',
                maxWidth: 420,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <button
                onClick={() => setOpenNotify(false)}
                aria-label="Close"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: tokens.textMuted,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>

              <div
                style={{
                  padding: 16,
                  background: '#ffffff',
                  border: `1px solid ${tokens.border}`,
                  lineHeight: 0,
                }}
              >
                <QRCodeSVG
                  value={qrValue}
                  size={232}
                  level="M"
                  marginSize={0}
                  fgColor="#0a0a0a"
                  bgColor="#ffffff"
                />
              </div>

              <h2
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.05,
                  textTransform: 'uppercase',
                  color: tokens.text,
                  margin: '24px 0 8px',
                }}
              >
                {product.name}
              </h2>

              <div
                style={{
                  fontFamily: tokens.monoStack,
                  fontSize: 13,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: tokens.blue,
                }}
              >
                Scan for details online
              </div>
            </motion.div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}

/** Append kiosk UTM tags without clobbering existing query params. */
function withUtm(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'kiosk')
    u.searchParams.set('utm_medium', 'qr')
    return u.toString()
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}utm_source=kiosk&utm_medium=qr`
  }
}

function QrGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <line x1="14" y1="14" x2="14" y2="17" />
      <line x1="17" y1="14" x2="21" y2="14" />
      <line x1="21" y1="14" x2="21" y2="21" />
      <line x1="14" y1="21" x2="18" y2="21" />
    </svg>
  )
}

export default ProductDetailQr
