import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'STV GROUP — Kiosk',
  description: 'Interactive product kiosk for STV GROUP a.s. — 3D product viewer for trade-show installations.',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
