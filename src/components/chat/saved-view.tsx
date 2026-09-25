'use client'
import { useEffect, useMemo } from 'react'
import { Bookmark, BookmarkCheck, ChevronLeft, CornerDownRight, Hash, Lock, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import type { ChannelDTO, MessageDTO } from '@/lib/types'
import { formatRelativeTime, formatTimeHover } from '@/lib/time'
import { MarkdownBody } from '@/lib/markdown'
import { UserAvatar } from './avatar'

// ─── channel badge ───────────────────────────────────────────────────────────

function ChannelBadge({ channel, onJump }: { channel: ChannelDTO; onJump: () => void }) {
  const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'
  const label = isDm
    ? channel.kind === 'dm'
      ? channel.members?.[0]?.name ?? channel.name
      : (channel.members ?? []).map((m) => m.name.split(' ')[0]).join(', ') || channel.name
    : channel.name

  return (
    <button
      type="button"
      onClick={onJump}
      title={`Go to ${isDm ? label : `#${channel.name}`}`}
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
    >
      {isDm ? (
        <MessageCircle className="h-3 w-3" aria-hidden />
      ) : channel.kind === 'private' ? (
        <Lock className="h-3 w-3" aria-hidden />
      ) : (
        <Hash className="h-3 w-3" aria-hidden />
      )}
      <span className="max-w-32 truncate">{label}</span>
    </button>
  )
}

// ─── saved card ──────────────────────────────────────────────────────────────

function SavedCard({ message }: { message: MessageDTO }) {
  const users = useChatStore((s) => s.users)
  const channels = useChatStore((s) => s.channels)
  const toggleSavedMessage = useChatStore((s) => s.toggleSavedMessage)
  const openChannel = useChatStore((s) => s.openChannel)
  const openThread = useChatStore((s) => s.openThread)
  const setJumpToMessageId = useChatStore((s) => s.setJumpToMessageId)
  const setView = useViewStore((s) => s.setView)

  const channel = channels.find((c) => c.id === message.channelId) ?? null

  const jumpToChannel = () => {
    setView('chat')
    void openChannel(message.channelId)
  }

  const jumpToMessage = () => {
    setView('chat')
    const open = openChannel(message.channelId)
    if (message.parentId) {
      // thread replies live in the thread panel — open the thread instead
      void open.then(() => openThread(message.parentId!))
    } else {
      void open.then(() => setJumpToMessageId(message.id))
    }
  }

  const unsave = () => {
    toggleSavedMessage(message.id)
    toast.success('Removed from saved items')
  }

  return (
    <article className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:border-emerald-500/40 hover:shadow-md hover:shadow-emerald-500/5">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <UserAvatar user={message.sender ?? { name: '?', avatarColor: '#71717a', kind: 'human' }} size="sm" />
        <span className="text-sm font-bold">{message.sender?.name ?? 'Unknown'}</span>
        <time
          dateTime={message.createdAt}
          title={formatTimeHover(message.createdAt)}
          className="text-[11px] text-muted-foreground"
        >
          {formatRelativeTime(message.createdAt)}
        </time>
        {message.parentId && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
            <CornerDownRight className="h-3 w-3" aria-hidden /> in a thread
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {channel && <ChannelBadge channel={channel} onJump={jumpToChannel} />}
          <button
            type="button"
            onClick={unsave}
            aria-label="Remove from saved items"
            title="Remove from saved items"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition-colors duration-150 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <BookmarkCheck className="h-4 w-4" aria-hidden />
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-lg px-2.5 text-xs font-semibold"
            onClick={jumpToMessage}
          >
            <ChevronLeft className="h-3.5 w-3.5 rotate-180" aria-hidden />
            Jump to message
          </Button>
        </span>
      </header>

      <div className="mt-2.5 min-w-0">
        {message.deletedAt ? (
          <p className="text-sm italic text-muted-foreground">This message was deleted.</p>
        ) : (
          <MarkdownBody
            body={message.body}
            users={users}
            channels={channels}
            onOpenProfile={(userId) => useChatStore.getState().setProfileUserId(userId)}
            onOpenChannel={(channelId) => {
              setView('chat')
              void useChatStore.getState().openChannel(channelId)
            }}
            className="text-[14px]"
          />
        )}
      </div>
    </article>
  )
}

// ─── view ────────────────────────────────────────────────────────────────────

export function SavedView() {
  const setView = useViewStore((s) => s.setView)
  const savedIds = useChatStore((s) => s.savedMessageIds)
  const messagesByChannel = useChatStore((s) => s.messagesByChannel)
  const threadReplies = useChatStore((s) => s.threadReplies)
  const savedExtras = useChatStore((s) => s.savedExtras)
  const refreshSavedExtras = useChatStore((s) => s.refreshSavedExtras)

  // Lazily (re-)fetch saved messages that aren't in any loaded channel —
  // state is only set from the async store action, so this effect is safe.
  useEffect(() => {
    void refreshSavedExtras()
  }, [refreshSavedExtras, savedIds])

  // Live-loaded data always wins over the cached snapshot — that way edits,
  // reactions and deletions show up correctly for open channels.
  const items = useMemo<(MessageDTO | null)[]>(() => {
    const findLoaded = (id: string): MessageDTO | null => {
      for (const list of Object.values(messagesByChannel)) {
        const hit = (list ?? []).find((m) => m.id === id)
        if (hit) return hit
      }
      for (const replies of Object.values(threadReplies)) {
        const hit = (replies ?? []).find((m) => m.id === id)
        if (hit) return hit
      }
      return savedExtras[id] ?? null
    }
    return savedIds.map(findLoaded)
  }, [savedIds, messagesByChannel, threadReplies, savedExtras])

  const loadedCount = items.filter(Boolean).length

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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
          <Bookmark className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">
            Saved items
            {savedIds.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {loadedCount === savedIds.length ? savedIds.length : `${loadedCount}/${savedIds.length}`}
              </span>
            )}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Messages you bookmarked for later — jump straight back into the conversation.
          </p>
        </div>
      </header>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-5 md:px-6">
          {savedIds.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-emerald-500/30 bg-emerald-500/5">
                <Bookmark className="h-9 w-9 text-emerald-600/70 dark:text-emerald-400/70" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-bold">Nothing saved yet</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Save important messages so you can find them later — hover any message, open the{' '}
                  <span className="font-semibold text-foreground/80">⋯ menu</span> and choose{' '}
                  <span className="font-semibold text-foreground/80">Save message</span>.
                </p>
              </div>
            </div>
          ) : (
            items.map((item, index) =>
              item ? (
                <SavedCard key={item.id} message={item} />
              ) : (
                <div
                  key={savedIds[index] ?? `slot-${index}`}
                  className="rounded-xl border border-border bg-card p-4"
                  aria-busy="true"
                  aria-label="Loading saved message"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className={cn('h-3.5', index % 2 === 0 ? 'w-2/3' : 'w-1/2')} />
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  )
}
