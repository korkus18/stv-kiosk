'use client'

import { CATEGORIES } from '@/data/categories'
import { CATEGORY_ICONS, AllIcon } from '@/components/icons/category-icons'
import { countByCategory } from '@/data/products'
import type { CategoryId } from '@/data/categories'
import { tokens } from './tokens'

type Props = {
  active: CategoryId | 'all'
  onChange: (id: CategoryId | 'all') => void
}

export function CategoryFilter({ active, onChange }: Props) {
  const counts = countByCategory()

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <FilterPill
        label="All"
        count={counts.all}
        icon={<AllIcon size={18} strokeWidth={2} />}
        active={active === 'all'}
        onClick={() => onChange('all')}
      />
      {CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.iconKey]
        return (
          <FilterPill
            key={cat.id}
            label={cat.label}
            count={counts[cat.id] || 0}
            icon={<Icon size={18} strokeWidth={2} />}
            active={active === cat.id}
            onClick={() => onChange(cat.id)}
          />
        )
      })}
    </div>
  )
}

function FilterPill({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string
  count: number
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: active ? tokens.bgSelected : 'transparent',
        color: active ? tokens.textOnBlue : tokens.textSecondary,
        border: active
          ? `1px solid ${tokens.bgSelected}`
          : `1px solid ${tokens.border}`,
        borderRadius: 0,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 180ms ease',
        fontFamily: 'inherit',
        lineHeight: 1,
      }}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      <span>{label}</span>
      <span
        style={{
          opacity: 0.65,
          fontSize: 10,
          fontFamily: tokens.monoStack,
          marginLeft: 2,
        }}
      >
        {count}
      </span>
    </button>
  )
}
