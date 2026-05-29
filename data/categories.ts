export type CategoryId =
  | 'engineer'
  | 'explosives'
  | 'mortar'
  | 'artillery'
  | 'rocket'
  | 'smallcal'

export type CategoryMeta = {
  id: CategoryId
  label: string
  iconKey: CategoryId
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'engineer',   label: 'Engineer',      iconKey: 'engineer'   },
  { id: 'explosives', label: 'Explosives',    iconKey: 'explosives' },
  { id: 'mortar',     label: 'Mortar',        iconKey: 'mortar'     },
  { id: 'artillery',  label: 'Artillery',     iconKey: 'artillery'  },
  { id: 'rocket',     label: 'Rocket',        iconKey: 'rocket'     },
  { id: 'smallcal',   label: 'Small Caliber', iconKey: 'smallcal'   },
]

export function getCategory(id: CategoryId): CategoryMeta {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]
}
