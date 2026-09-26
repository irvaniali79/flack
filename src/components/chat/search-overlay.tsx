'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Hash, Loader2, Search, UserRound } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import type { ChannelDTO, MessageDTO, UserDTO } from '@/lib/types'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/time'
import { UserAvatar } from './avatar'
import { AppBadge } from './connectors/connector-icon'

interface SearchResults {
  messages: (MessageDTO & { channelName?: string })[]
  channels: ChannelDTO[]
  users: UserDTO[]
}

const EMPTY: SearchResults = { messages: [], channels: [], users: [] }

function Highlighted({ text, query }: { text: string; query: string }) {
  const terms = useMemo(
    () =>
      query
        .split(/\s+/)
        .map((term) => term.replace(/^(from|in|has):.*$/i, ''))
        .filter((term) => term.length > 1)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    [query],
  )
  const parts = useMemo(() => {
    if (terms.length === 0) return [text]
    return text
      .split(new RegExp(`(${terms.join('|')})`, 'gi'))
      .filter((part) => part.length > 0)
  }, [text, terms])

  if (terms.length === 0) return <>{text}</>
  const pattern = new RegExp(`^(${terms.join('|')})$`, 'i')
  return (
    <>
      {parts.map((part, index) =>
        pattern.test(part) ? (
          <mark key={index} className="rounded-sm bg-amber-300/60 px-0.5 text-foreground dark:bg-amber-500/30">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

export function SearchOverlay() {
  const open = useChatStore((s) => s.searchOpen)
  const seed = useChatStore((s) => s.searchSeed)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const openChannel = useChatStore((s) => s.openChannel)
  const setJumpToMessageId = useChatStore((s) => s.setJumpToMessageId)
  const createDm = useChatStore((s) => s.createDm)
  const joinChannel = useChatStore((s) => s.joinChannel)

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'messages' | 'channels' | 'people'>('messages')
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [resultsFor, setResultsFor] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seqRef = useRef(0)

  // Reset the search session whenever the overlay is (re)opened or seeded —
  // derived during render instead of a state-resetting effect.
  const [lastSession, setLastSession] = useState({ open, seed })
  if (open !== lastSession.open || (open && seed !== lastSession.seed)) {
    setLastSession({ open, seed })
    if (open) {
      setQuery(seed)
      setTab('messages')
      setResults(EMPTY)
      setResultsFor('')
    }
  }

  // Focus the input once the overlay is open.
  useEffect(() => {
    if (!open) return
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(focusTimer)
  }, [open])

  // Debounced search — all state updates happen in async callbacks; the
  // loading spinner itself is derived from (query !== resultsFor).
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (!trimmed) return // nothing to search — the render shows the idle placeholder
    const seq = ++seqRef.current
    debounceRef.current = setTimeout(() => {
      api<SearchResults>(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (seqRef.current !== seq) return
          setResults({ messages: data.messages ?? [], channels: data.channels ?? [], users: data.users ?? [] })
          setResultsFor(trimmed)
        })
        .catch(() => {
          if (seqRef.current !== seq) return
          setResults(EMPTY)
          setResultsFor(trimmed)
        })
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query, open])

  const trimmed = query.trim()
  const loading = !!trimmed && resultsFor !== trimmed
  const hasAny = results.messages.length + results.channels.length + results.users.length > 0

  const jumpToMessage = (message: MessageDTO) => {
    setSearchOpen(false)
    void openChannel(message.channelId).then(() => {
      setJumpToMessageId(message.id)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => setSearchOpen(next)}>
      <DialogContent className="top-[12%] max-h-[calc(75vh/var(--ui-scale))] translate-y-0 gap-0 overflow-hidden p-0 rounded-2xl sm:max-w-xl">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search messages, channels and people</DialogDescription>
          <div className="flex items-center gap-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, channels, people…"
              aria-label="Search query"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['from:name', 'in:#channel', 'has:file'].map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => setQuery((q) => (q ? `${q.trimEnd()} ${hint} ` : `${hint} `))}
                className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-150 hover:bg-accent"
              >
                {hint}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* tabs */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          {(
            [
              ['messages', `Messages${results.messages.length ? ` ${results.messages.length}` : ''}`],
              ['channels', `Channels${results.channels.length ? ` ${results.channels.length}` : ''}`],
              ['people', `People${results.users.length ? ` ${results.users.length}` : ''}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150',
                tab === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[calc(52vh/var(--ui-scale))] overflow-y-auto p-2">
          {!trimmed ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium">Search everything</p>
              <p className="text-xs text-muted-foreground">
                Try <code className="rounded bg-muted px-1">deploy</code>,{' '}
                <code className="rounded bg-muted px-1">from:priya</code> or{' '}
                <code className="rounded bg-muted px-1">in:#engineering has:file</code>
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex animate-pulse gap-3 px-2 py-2">
                  <div className="h-7 w-7 shrink-0 rounded-md bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-3 w-3/4 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasAny ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="text-sm font-medium">No results for “{trimmed}”</p>
              <p className="text-xs text-muted-foreground">Try fewer words or remove filters.</p>
            </div>
          ) : tab === 'messages' ? (
            results.messages.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No message matches</p>
            ) : (
              results.messages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => jumpToMessage(message)}
                  className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent"
                >
                  <UserAvatar
                    user={message.sender ?? { name: '?', avatarColor: '#71717a', kind: 'human' }}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{message.sender?.name ?? 'Unknown'}</span>
                      <span className="text-muted-foreground">{formatRelativeTime(message.createdAt)}</span>
                      {message.channelName && (
                        <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                          <Hash className="h-3 w-3" aria-hidden />
                          {message.channelName.replace(/^#/, '')}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-foreground/85">
                      <Highlighted text={message.body.replace(/\n+/g, ' ')} query={trimmed} />
                    </span>
                  </span>
                </button>
              ))
            )
          ) : tab === 'channels' ? (
            results.channels.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No channel matches</p>
            ) : (
              results.channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false)
                    if (channel.isMember) void openChannel(channel.id)
                    else {
                      void joinChannel(channel.id)
                      toast.success(`Joined #${channel.name}`)
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Hash className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{channel.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {channel.memberCount} members{channel.topic ? ` · ${channel.topic}` : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      channel.isMember
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {channel.isMember ? 'Open' : 'Join'}
                  </span>
                </button>
              ))
            )
          ) : results.users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No person matches</p>
          ) : (
            results.users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  setSearchOpen(false)
                  void createDm([user.id])
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent"
              >
                <UserAvatar user={user} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{user.name}</span>
                    {user.kind === 'app' && <AppBadge className="shrink-0" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.title ?? (user.kind === 'agent' ? 'AI agent' : '')}
                  </span>
                </span>
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
