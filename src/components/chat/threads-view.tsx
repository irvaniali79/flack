'use client'
// Threads view — every thread you follow, Slack's "Threads" surface.
// Root authors and repliers auto-follow, so this is "threads I'm part of".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Bell,
  BellOff,
  Hash,
  Loader2,
  MessagesSquare,
  Reply,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/time'
import type { ThreadCardDTO, UserDTO } from '@/lib/types'

type Filter = 'all' | 'unread'

function ThreadSkeleton() {
  return (
    <div className="space-y-3 px-4 py-3 sm:px-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-border p-4"
          aria-hidden
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="w-full space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ParticipantStack({ participants, total }: { participants: ThreadCardDTO['participants']; total: number }) {
  const extra = Math.max(0, total - participants.length)
  return (
    <span className="flex items-center" aria-label={`${total} participants`}>
      <span className="flex -space-x-1.5">
        {participants.map((p) => (
          <span
            key={p.id}
            title={p.name}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-background"
            style={{ backgroundColor: p.avatarColor }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
        {extra > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground ring-2 ring-background">
            +{extra}
          </span>
        )}
      </span>
    </span>
  )
}

function EmptyThreads() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <MessagesSquare className="h-7 w-7" aria-hidden />
      </div>
      <p className="text-sm font-semibold">No threads yet</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
        Reply to any message in a channel to start a thread — every thread you
        start or reply in shows up here so you never lose track of it.
      </p>
    </div>
  )
}

function EmptyUnread() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Search className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold">You&apos;re all caught up</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
        No new replies in the threads you follow. New replies will surface here
        with a badge.
      </p>
    </div>
  )
}

export function ThreadsView() {
  const openChannel = useChatStore((s) => s.openChannel)
  const openThread = useChatStore((s) => s.openThread)
  const toggleThreadFollow = useChatStore((s) => s.toggleThreadFollow)
  const channels = useChatStore((s) => s.channels)
  const setView = useViewStore((s) => s.setView)

  const [threads, setThreads] = useState<ThreadCardDTO[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busyRoot, setBusyRoot] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ threads: ThreadCardDTO[] }>('/api/threads')
      setThreads(data.threads)
    } catch {
      setThreads([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = useMemo(() => {
    if (!threads) return null
    return filter === 'unread' ? threads.filter((t) => t.unreadReplies > 0) : threads
  }, [threads, filter])

  const unreadCount = threads?.filter((t) => t.unreadReplies > 0).length ?? 0

  const openCard = (card: ThreadCardDTO) => {
    // Same channel already open? The app.tsx effect won't refire — switch view
    // explicitly, then open the thread panel.
    setView('chat')
    void openChannel(card.channel.id).then(() => openThread(card.rootId))
  }

  const unfollow = async (card: ThreadCardDTO) => {
    if (busyRoot) return
    setBusyRoot(card.rootId)
    try {
      await toggleThreadFollow(card.rootId, false)
      setThreads((prev) => prev?.filter((t) => t.rootId !== card.rootId) ?? prev)
      toast.success('Thread unfollowed — new replies won&apos;t notify you', {
        description: `#${card.channel.slug}`,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not unfollow')
    } finally {
      setBusyRoot(null)
    }
  }

  const channelLabel = (card: ThreadCardDTO) => {
    const ch = channels.find((c) => c.id === card.channel.id)
    if (ch && (ch.kind === 'dm' || ch.kind === 'group_dm')) {
      return ch.members?.map((m: UserDTO) => m.name).join(', ') ?? 'Direct message'
    }
    return card.channel.slug
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessagesSquare className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">Threads</h1>
            <p className="text-xs text-muted-foreground">
              {threads === null
                ? 'Loading your threads…'
                : `${threads.length} followed · ${unreadCount} with new replies`}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="Filter threads">
            {(['all', 'unread'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'relative min-h-9 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors duration-150',
                  filter === f
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'all' ? 'All' : 'Unread'}
                {f === 'unread' && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {visible === null ? (
          <ThreadSkeleton />
        ) : visible.length === 0 ? (
          filter === 'unread' ? (
            <EmptyUnread />
          ) : (
            <EmptyThreads />
          )
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2.5">
            {visible.map((card) => (
              <li key={card.rootId}>
                <div
                  className={cn(
                    'group relative flex gap-3 rounded-xl border p-4 transition-all duration-150',
                    card.unreadReplies > 0
                      ? 'border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-500/60 hover:bg-emerald-500/[0.07]'
                      : 'border-border hover:border-zinc-300 hover:bg-accent/50 dark:hover:border-zinc-700',
                  )}
                >
                  {/* root sender avatar */}
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: card.root.senderColor ?? '#71717b' }}
                    aria-hidden
                  >
                    {(card.root.senderName ?? '?').slice(0, 2).toUpperCase()}
                  </span>

                  {/* clickable body */}
                  <button
                    type="button"
                    onClick={() => openCard(card)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open thread by ${card.root.senderName ?? 'Unknown'} in ${card.channel.slug}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          'truncate text-sm',
                          card.unreadReplies > 0 ? 'font-bold' : 'font-semibold',
                        )}
                      >
                        {card.root.senderName ?? 'Unknown'}
                      </span>
                      <span className="flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Hash className="h-3 w-3" aria-hidden />
                        {channelLabel(card)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(card.lastActivityAt)}
                      </span>
                      {card.unreadReplies > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          New replies
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1 line-clamp-2 text-[13px] leading-relaxed',
                        card.unreadReplies > 0
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {card.root.body || (
                        <span className="italic text-muted-foreground/70">
                          (deleted message)
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <Reply className="h-3.5 w-3.5" aria-hidden />
                        {card.replyCount} {card.replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                      <ParticipantStack participants={card.participants} total={card.participantCount} />
                      {card.participantCount > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {card.participantCount}{' '}
                          {card.participantCount === 1 ? 'person' : 'people'}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* unfollow — visible on hover (always visible on touch) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Unfollow thread in ${card.channel.slug}`}
                    disabled={busyRoot === card.rootId}
                    onClick={() => void unfollow(card)}
                    className={cn(
                      'absolute right-3 top-3 h-8 gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground',
                      'opacity-100 transition-opacity duration-150 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400',
                      'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
                    )}
                  >
                    {busyRoot === card.rootId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <BellOff className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span className="hidden sm:inline">Unfollow</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* footer hint */}
      {visible !== null && visible.length > 0 && (
        <footer className="shrink-0 border-t border-border px-4 py-2.5 sm:px-6">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Bell className="h-3 w-3 shrink-0" aria-hidden />
            You auto-follow threads you start or reply in — unfollow any thread
            to stop its notifications.
          </p>
        </footer>
      )}
    </div>
  )
}
