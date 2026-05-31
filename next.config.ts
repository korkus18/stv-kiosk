import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Kiosk: never show the dev-tools indicator (the small badge in the corner).
  // Production static export never renders it anyway; this clears it in dev too.
  devIndicators: false,
}

export default nextConfig
