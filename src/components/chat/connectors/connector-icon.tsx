'use client'
// Client-side icon map for the connector catalog. src/lib/connectors.ts is
// server-only (it imports the Prisma client), so the icon keys it references
// are resolved HERE on the client. Also carries a tiny brand map
// (connectorId → icon/color/name) so app messages can render their tile
// without importing the server catalog.
import { createElement } from 'react'
import {
  Box,
  Bug,
  Calendar,
  CalendarDays,
  ClipboardList,
  Cloud,
  CloudUpload,
  Film,
  Gauge,
  Github,
  HardDrive,
  LifeBuoy,
  NotebookPen,
  Palette,
  PenTool,
  Presentation,
  Puzzle,
  Table2,
  Trello,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, LucideIcon> = {
  calendar: Calendar,
  'calendar-days': CalendarDays,
  'hard-drive': HardDrive,
  github: Github,
  video: Video,
  film: Film,
  trello: Trello,
  clipboard: ClipboardList,
  bug: Bug,
  gauge: Gauge,
  cloud: Cloud,
  // lucide-react has no Dropbox mark — the cloud-up glyph stands in
  dropbox: CloudUpload,
  box: Box,
  notebook: NotebookPen,
  table: Table2,
  lifebuoy: LifeBuoy,
  presentation: Presentation,
  'pen-tool': PenTool,
  palette: Palette,
  zap: Zap,
}

export function connectorIconFor(iconKey: string): LucideIcon {
  return ICON_MAP[iconKey] ?? Puzzle
}

/** Brand data for every catalog connector (mirrors src/lib/connectors.ts) —
 *  lets app messages render tiles without a server import. */
export const CONNECTOR_BRAND: Record<
  string,
  { icon: string; color: string; name: string }
> = {
  'google-calendar': { icon: 'calendar', color: '#1a73e8', name: 'Google Calendar' },
  'google-drive': { icon: 'hard-drive', color: '#0f9d58', name: 'Google Drive' },
  github: { icon: 'github', color: '#24292f', name: 'GitHub' },
  jira: { icon: 'bug', color: '#0052cc', name: 'Jira Software' },
  zoom: { icon: 'video', color: '#2d8cff', name: 'Zoom' },
  loom: { icon: 'film', color: '#625df5', name: 'Loom' },
  trello: { icon: 'trello', color: '#0079bf', name: 'Trello' },
  asana: { icon: 'clipboard', color: '#f06a52', name: 'Asana' },
  notion: { icon: 'notebook', color: '#181818', name: 'Notion' },
  airtable: { icon: 'table', color: '#fcb400', name: 'Airtable' },
  salesforce: { icon: 'cloud', color: '#00a1e0', name: 'Salesforce' },
  hubspot: { icon: 'gauge', color: '#ff7a59', name: 'HubSpot' },
  zendesk: { icon: 'lifebuoy', color: '#03363d', name: 'Zendesk' },
  dropbox: { icon: 'dropbox', color: '#0061ff', name: 'Dropbox' },
  box: { icon: 'box', color: '#0061d5', name: 'Box' },
  figma: { icon: 'pen-tool', color: '#a259ff', name: 'Figma' },
  miro: { icon: 'presentation', color: '#ffdd00', name: 'Miro' },
  canva: { icon: 'palette', color: '#00c4cc', name: 'Canva' },
  'outlook-calendar': { icon: 'calendar-days', color: '#0f6cbd', name: 'Outlook Calendar' },
  zapier: { icon: 'zap', color: '#ff4a00', name: 'Zapier' },
}

const TILE_SIZES = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-xl',
  xl: 'h-14 w-14 rounded-2xl',
} as const

const GLYPH_SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-5 w-5',
  xl: 'h-7 w-7',
} as const

/** Relative luminance of a #rrggbb hex — bright brands (Miro yellow) get a
 *  dark glyph instead of white for contrast. */
function isBrightBrand(color: string): boolean {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return false
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const r = channel(parseInt(hex.slice(0, 2), 16))
  const g = channel(parseInt(hex.slice(2, 4), 16))
  const b = channel(parseInt(hex.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55
}

/** Text color that stays readable on a brand fill (white, or near-black on
 *  bright brands like Miro yellow). */
export function brandTextColor(color: string): string {
  return isBrightBrand(color) ? '#18181b' : '#ffffff'
}

/** The small "APP" badge shown next to app-user names everywhere
 *  (message sender rows, member lists, profiles). Mirrors the agent badge. */
export function AppBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'rounded bg-accent px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      title="App — a connected connector"
    >
      APP
    </span>
  )
}

/** The connector's brand tile: rounded, brand-colored, white glyph.
 *  Reused by the directory cards, the connect dialog and app messages. */
export function ConnectorTile({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string
  color: string
  size?: keyof typeof TILE_SIZES
  className?: string
}) {
  const glyph = connectorIconFor(icon)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center shadow-sm',
        TILE_SIZES[size],
        isBrightBrand(color) ? 'text-zinc-900' : 'text-white',
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {/* createElement dodges the static-components lint rule — the icon is a
          stable map lookup, not a component created during render */}
      {createElement(glyph, { className: GLYPH_SIZES[size] })}
    </span>
  )
}
