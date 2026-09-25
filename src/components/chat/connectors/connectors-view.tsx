'use client'
// App directory — the Slack-style connector view. Two zones:
//   1. "Your connections" — the org's active installs with live management
//   2. The directory grid — 20 connectors, category filter + search
// Admins can install (3-step dialog) and manage; members browse and can
// still fire test events on existing connections.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Blocks,
  ChevronLeft,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { cn } from '@/lib/utils'
import type { ConnectorConnectionDTO, ConnectorDefDTO } from '@/lib/types'
import { ConnectorTile } from './connector-icon'
import { ConnectionCard } from './connection-card'
import { ConnectDialog } from './connect-dialog'

interface DirectoryData {
  connectors: ConnectorDefDTO[]
  connections: ConnectorConnectionDTO[]
  categories: string[]
}

export function ConnectorsView() {
  const me = useChatStore((s) => s.me)
  const setView = useViewStore((s) => s.setView)

  const [data, setData] = useState<DirectoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [category, setCategory] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [connectDef, setConnectDef] = useState<ConnectorDefDTO | null>(null)

  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await api<DirectoryData>('/api/connectors')
      setData(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the App directory')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Refresh when the tab regains focus — connection changes from other
  // sessions (or the parallel QA browser) show up without a manual refresh.
  useEffect(() => {
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const defById = useMemo(() => {
    const map = new Map<string, ConnectorDefDTO>()
    for (const def of data?.connectors ?? []) map.set(def.id, def)
    return map
  }, [data])

  const connections = data?.connections ?? []
  const eventsFlowing = connections.reduce(
    (sum, c) => sum + Object.values(c.eventSubs).filter(Boolean).length,
    0,
  )

  const filtered = useMemo(() => {
    const all = data?.connectors ?? []
    const q = query.trim().toLowerCase()
    return all.filter(
      (def) =>
        (category === 'All' || def.category === category) &&
        (q === '' ||
          def.name.toLowerCase().includes(q) ||
          def.tagline.toLowerCase().includes(q) ||
          def.category.toLowerCase().includes(q)),
    )
  }, [data, category, query])

  const chips = ['All', ...(data?.categories ?? [])]

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('chat')}
          className="h-8 shrink-0 rounded-lg px-2 text-muted-foreground"
          aria-label="Back to chat"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Chat</span>
        </Button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400">
          <Blocks className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">App directory</h1>
          <p className="truncate text-xs text-muted-foreground">
            Connect the tools your team already uses — events post straight into channels.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={refreshing}
          className="rounded-lg"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </header>

      {/* scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
          {/* stats */}
          {data ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium">
                <Blocks className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
                {data.connectors.length} connectors available
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium">
                <PlugZap
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                {connections.length} connected
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium">
                <span
                  className="relative flex h-2 w-2"
                  aria-hidden
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                </span>
                {eventsFlowing} events flowing
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <Skeleton className="h-7 w-40 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          )}

          {/* your connections */}
          <section aria-labelledby="connections-heading" className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h2 id="connections-heading" className="text-sm font-bold">
                Your connections
              </h2>
              {data && (
                <span className="text-xs text-muted-foreground">
                  — active installs in this workspace
                </span>
              )}
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                {error}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-3 h-7 rounded-lg"
                  onClick={() => void load()}
                >
                  Retry
                </Button>
              </div>
            ) : !data ? (
              <div className="space-y-3">
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
              </div>
            ) : connections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium">No connectors installed yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick one from the directory below — events post into the channel you choose.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {connections.map((connection) => {
                  const def = defById.get(connection.connectorId)
                  if (!def) return null
                  return (
                    <div key={connection.id} id={`connection-${connection.id}`}>
                      <ConnectionCard
                        connection={connection}
                        def={def}
                        canManage={isAdmin}
                        onChanged={() => void load()}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* directory */}
          <section aria-labelledby="directory-heading" className="space-y-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <h2 id="directory-heading" className="text-sm font-bold">
                  Browse apps
                </h2>
                <span className="text-xs text-muted-foreground">
                  — {data ? `${data.connectors.length} in the catalog` : '…'}
                </span>
              </div>

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or tagline…"
                  aria-label="Search connectors"
                  className="h-9 rounded-lg pl-9 pr-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

              <div
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
                role="tablist"
                aria-label="Filter by category"
              >
                {chips.map((chip) => {
                  const active = chip === category
                  return (
                    <button
                      key={chip}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCategory(chip)}
                      className={cn(
                        'h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                        active
                          ? 'border-violet-500/50 bg-violet-600/15 text-violet-700 dark:text-violet-300'
                          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {chip}
                    </button>
                  )
                })}
              </div>
            </div>

            {!data ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <p className="text-sm font-medium">No connectors match “{query.trim()}”</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different search or category.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg"
                  onClick={() => {
                    setQuery('')
                    setCategory('All')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {filtered.map((def, index) => (
                    <ConnectorCard
                      key={`${category}-${def.id}`}
                      def={def}
                      isAdmin={!!isAdmin}
                      index={index}
                      onConnect={() => setConnectDef(def)}
                      onManage={() => {
                        const first = connections.find((c) => c.connectorId === def.id)
                        const target = first
                          ? document.getElementById(`connection-${first.id}`)
                          : null
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          target.animate(
                            [
                              { boxShadow: '0 0 0 0 rgba(139,92,246,0)' },
                              { boxShadow: '0 0 0 4px rgba(139,92,246,0.35)' },
                              { boxShadow: '0 0 0 0 rgba(139,92,246,0)' },
                            ],
                            { duration: 1200, easing: 'ease-out' },
                          )
                        }
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>
      </div>

      <ConnectDialog
        def={connectDef}
        open={!!connectDef}
        onOpenChange={(open) => !open && setConnectDef(null)}
        onConnected={() => void load()}
      />
    </div>
  )
}

/** One directory tile: brand tile, name + category, tagline, chips, CTA. */
function ConnectorCard({
  def,
  isAdmin,
  index,
  onConnect,
  onManage,
}: {
  def: ConnectorDefDTO
  isAdmin: boolean
  index: number
  onConnect: () => void
  onManage: () => void
}) {
  const connected = def.connectedCount > 0
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(index * 0.025, 0.25) }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <ConnectorTile icon={def.icon} color={def.color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-bold leading-tight">{def.name}</h3>
            <span className="rounded bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {def.category}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {def.tagline}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {def.events.length} event{def.events.length === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {def.scopes.length} scope{def.scopes.length === 1 ? '' : 's'}
        </span>
        {connected && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            {def.connectedCount} connected
          </span>
        )}
      </div>

      {connected ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onManage}
          className="h-8 w-full rounded-lg text-xs"
        >
          Manage
        </Button>
      ) : isAdmin ? (
        <Button
          size="sm"
          onClick={onConnect}
          className="h-8 w-full rounded-lg bg-violet-600 text-white hover:bg-violet-500"
        >
          <PlugZap className="h-3.5 w-3.5" aria-hidden />
          Connect
        </Button>
      ) : (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper so the tooltip fires on the disabled button */}
              <span className="block w-full cursor-not-allowed" title="">
                <Button size="sm" disabled className="h-8 w-full rounded-lg text-xs">
                  <PlugZap className="h-3.5 w-3.5" aria-hidden />
                  Connect
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Requires admin — ask a workspace admin to install</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </motion.div>
  )
}
