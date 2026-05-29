/**
 * STV GROUP Category Icons
 * Brand-faithful monoline icons matching the official brand manual style:
 * - Single-weight stroke
 * - Round caps and joins
 * - No fills (pure outline)
 * - Geometric, recognizable at small size
 * - Designed at 64x64 viewBox, scales cleanly
 *
 * Three icons (smallcal, mortar, explosives) match brand manual exactly.
 * Three icons (engineer, artillery, rocket) are designed in matching style.
 *
 * Usage:
 *   <SmallcalIcon size={32} />
 *   <SmallcalIcon className="text-blue-500" />
 *
 * Default color: currentColor (inherits from parent text color)
 */

import React from 'react'

type IconProps = {
  size?: number
  className?: string
  strokeWidth?: number
}

const baseProps = (size: number, strokeWidth: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 64 64',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  xmlns: 'http://www.w3.org/2000/svg',
})

// ── 1. SMALL CALIBER (střelivo) — 3 standing bullets ─────────────────────
// Matches brand manual "střelivo" icon
export const SmallcalIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Left bullet */}
    <path d="M14 26 Q14 16 18 14 Q22 16 22 26 L22 50 L14 50 Z" />
    <line x1="14" y1="40" x2="22" y2="40" />
    {/* Center bullet */}
    <path d="M28 22 Q28 12 32 10 Q36 12 36 22 L36 50 L28 50 Z" />
    <line x1="28" y1="36" x2="36" y2="36" />
    {/* Right bullet */}
    <path d="M42 26 Q42 16 46 14 Q50 16 50 26 L50 50 L42 50 Z" />
    <line x1="42" y1="40" x2="50" y2="40" />
    {/* Base line */}
    <line x1="12" y1="52" x2="52" y2="52" />
  </svg>
)

// ── 2. MORTAR (munice) — 3 mortar rounds hanging nose-down ───────────────
// Matches brand manual "munice" icon
export const MortarIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Round 1 (left) */}
    <path d="M16 10 L13 18 L19 18 Z" />
    <path d="M14 18 L14 38 L16 46 L18 38 L18 18" />
    {/* Round 2 (center) */}
    <path d="M32 10 L29 18 L35 18 Z" />
    <path d="M30 18 L30 38 L32 46 L34 38 L34 18" />
    {/* Round 3 (right) */}
    <path d="M48 10 L45 18 L51 18 Z" />
    <path d="M46 18 L46 38 L48 46 L50 38 L50 18" />
  </svg>
)

// ── 3. EXPLOSIVES (výbušniny) — burst star ────────────────────────────────
// Matches brand manual "výbušniny" icon
export const ExplosivesIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Irregular burst with 12 points of varying length from center 32,32 */}
    <path d="
      M 32 10
      L 36 22
      L 50 14
      L 44 26
      L 56 28
      L 46 34
      L 56 44
      L 42 42
      L 46 54
      L 36 44
      L 32 56
      L 28 44
      L 18 52
      L 22 40
      L 8 40
      L 20 32
      L 10 22
      L 24 24
      L 18 10
      L 28 20
      Z
    " />
  </svg>
)

// ── 4. ENGINEER AMMUNITION — demolition charge ───────────────────────────
// Custom icon designed in brand style (no direct brand match)
export const EngineerIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Main charge body */}
    <rect x="12" y="26" width="40" height="28" />
    {/* Top horizontal band */}
    <line x1="12" y1="36" x2="52" y2="36" />
    {/* Bottom horizontal band */}
    <line x1="12" y1="46" x2="52" y2="46" />
    {/* Detonator on top */}
    <rect x="26" y="18" width="12" height="8" />
    {/* Detonator wires going up */}
    <path d="M29 18 L29 10 M35 18 L35 10" />
  </svg>
)

// ── 5. ARTILLERY AMMUNITION — single artillery shell ─────────────────────
// Custom icon designed in brand style (no direct brand match)
export const ArtilleryIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Pointed conical tip */}
    <path d="M32 6 L22 22 L42 22 Z" />
    {/* Cylindrical body */}
    <line x1="22" y1="22" x2="22" y2="50" />
    <line x1="42" y1="22" x2="42" y2="50" />
    <line x1="22" y1="50" x2="42" y2="50" />
    {/* Driving band — upper */}
    <line x1="22" y1="32" x2="42" y2="32" />
    {/* Driving band — lower */}
    <line x1="22" y1="42" x2="42" y2="42" />
    {/* Base */}
    <rect x="20" y="50" width="24" height="6" />
  </svg>
)

// ── 6. ROCKET PROPELLED AMMUNITION — rocket with fins ────────────────────
// Custom icon designed in brand style (no direct brand match)
export const RocketIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    {/* Conical nose */}
    <path d="M32 6 L26 18 L38 18 Z" />
    {/* Cylindrical body */}
    <line x1="26" y1="18" x2="26" y2="42" />
    <line x1="38" y1="18" x2="38" y2="42" />
    <line x1="26" y1="42" x2="38" y2="42" />
    {/* Mid-body band */}
    <line x1="26" y1="30" x2="38" y2="30" />
    {/* Left fin */}
    <path d="M26 36 L16 56 L26 50" />
    {/* Right fin */}
    <path d="M38 36 L48 56 L38 50" />
    {/* Center exhaust line */}
    <line x1="32" y1="42" x2="32" y2="54" />
  </svg>
)

// ── ALL VIEW — 2×2 grid representing all categories ──────────────────────
// Used by the "All" pill in CategoryFilter so it has the same visual
// weight as the icon-bearing category pills.
export const AllIcon = ({ size = 32, className, strokeWidth = 2.5 }: IconProps) => (
  <svg {...baseProps(size, strokeWidth, className)}>
    <rect x="14" y="14" width="16" height="16" />
    <rect x="34" y="14" width="16" height="16" />
    <rect x="14" y="34" width="16" height="16" />
    <rect x="34" y="34" width="16" height="16" />
  </svg>
)

// ── Icon mapping by CategoryId ───────────────────────────────────────────
export const CATEGORY_ICONS = {
  engineer: EngineerIcon,
  explosives: ExplosivesIcon,
  mortar: MortarIcon,
  artillery: ArtilleryIcon,
  rocket: RocketIcon,
  smallcal: SmallcalIcon,
} as const

export type CategoryIconName = keyof typeof CATEGORY_ICONS
