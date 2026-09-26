// Accent color themes — shared data used by BOTH the server (PATCH /api/me
// validation) and the client (theme picker UI). The actual palette overrides
// live in src/app/globals.css under `[data-accent='<key>']` selectors; this
// file only describes the catalog. Keep the keys in sync with globals.css.

export interface AccentThemeDef {
  key: string
  /** Display name (Slack-style naming) */
  name: string
  /** Three swatch hexes for the picker preview (light-ish, mid, deep) */
  swatches: [string, string, string]
  /** One-line flavor text shown under the name in the picker */
  vibe: string
}

export const ACCENT_THEMES: AccentThemeDef[] = [
  {
    key: 'emerald',
    name: 'Emerald',
    // Matches the compiled Tailwind v4 emerald 400/500/600 actually rendered
    swatches: ['#00d294', '#00bb7f', '#009767'],
    vibe: 'The Flack default — fresh and focused',
  },
  {
    key: 'aubergine',
    name: 'Aubergine',
    swatches: ['#c084fc', '#a855f7', '#7e22ce'],
    vibe: 'Slack’s signature plum',
  },
  {
    key: 'cherry',
    name: 'Cherry',
    swatches: ['#fb7185', '#f43f5e', '#be123c'],
    vibe: 'Bold, warm red',
  },
  {
    key: 'tangerine',
    name: 'Tangerine',
    swatches: ['#fb923c', '#f97316', '#ea580c'],
    vibe: 'Energetic citrus',
  },
  {
    key: 'honey',
    name: 'Honey',
    swatches: ['#fcd34d', '#f59e0b', '#d97706'],
    vibe: 'Golden and mellow',
  },
  {
    key: 'seafoam',
    name: 'Seafoam',
    swatches: ['#5eead4', '#14b8a6', '#0d9488'],
    vibe: 'Cool coastal teal',
  },
  {
    key: 'grape',
    name: 'Grape',
    swatches: ['#d8b4fe', '#c084fc', '#9333ea'],
    vibe: 'Juicy violet',
  },
  {
    key: 'moss',
    name: 'Moss',
    swatches: ['#a3e635', '#84cc16', '#65a30d'],
    vibe: 'Woodland lime-green',
  },
  {
    key: 'brick',
    name: 'Brick',
    swatches: ['#fca5a5', '#dc2626', '#991b1b'],
    vibe: 'Grounded terracotta red',
  },
  {
    key: 'cocoa',
    name: 'Cocoa',
    swatches: ['#d1b096', '#b07d54', '#96683f'],
    vibe: 'Warm roasted brown',
  },
  {
    key: 'ocean',
    name: 'Ocean',
    swatches: ['#67e8f9', '#06b6d4', '#0891b2'],
    vibe: 'Deep cyan waters',
  },
  {
    key: 'coral',
    name: 'Coral',
    swatches: ['#fda4aa', '#fa717b', '#f14151'],
    vibe: 'Soft reef pink-red',
  },
]

export const DEFAULT_ACCENT = 'emerald'

export const ACCENT_KEYS = ACCENT_THEMES.map((t) => t.key)

export function isAccentKey(key: string): boolean {
  return ACCENT_KEYS.includes(key)
}

export function accentTheme(key: string): AccentThemeDef {
  return ACCENT_THEMES.find((t) => t.key === key) ?? ACCENT_THEMES[0]
}
