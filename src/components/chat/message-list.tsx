'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getActiveChannel, useChatStore } from '@/lib/store'
import type { MessageDTO } from '@/lib/types'
import { dayLabel } from '@/lib/time'
import { MessageItem } from './message-item'

const GROUP_WINDOW_MS = 5 * 60 * 1000

interface RenderEntry {
  key: string
  type: 'day' | 'unread' | 'message'
  message?: MessageDTO
  compact?: boolean
  label?: string
}

// The wrapper keys the inner list by channel id so switching channels remounts
// it with fresh scroll state (pinned to bottom, no pending pills) — the React
// idiomatic replacement for "reset state on prop change" effects.
export function MessageList() {
  const channel = useChatStore(getActiveChannel)
  const channelId = channel?.id ?? null
  return <MessageListInner key={channelId ?? 'none'} channelId={channelId} />
}

function MessageListInner({ channelId }: { channelId: string | null }) {
  const messages = useChatStore((s) => (channelId ? s.messagesByChannel[channelId] : undefined)) ?? []
  const loading = useChatStore((s) => (channelId ? !!s.messagesLoading[channelId] : false))
  const loadingOlder = useChatStore((s) => (channelId ? !!s.loadingOlder[channelId] : false))
  const hasMore = useChatStore((s) => (channelId ? !!s.hasMoreByChannel[channelId] : false))
  const unreadDividerId = useChatStore((s) => (channelId ? s.unreadDividerByChannel[channelId] : null))
  const me = useChatStore((s) => s.me)
  const loadOlder = useChatStore((s) => s.loadOlder)
  const jumpToMessageId = useChatStore((s) => s.jumpToMessageId)
  const setJumpToMessageId = useChatStore((s) => s.setJumpToMessageId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)
  const [newArrival, setNewArrival] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const lastMessageCountRef = useRef(0)

  // ── build render list (day separators, grouping, unread divider) ─────────
  const entries = useMemo<RenderEntry[]>(() => {
    const result: RenderEntry[] = []
    let lastSenderId: string | null = null
    let lastAt = 0
    let lastDay = ''
    let dividerPlaced = false
    for (const message of messages) {
      const day = dayLabel(message.createdAt)
      if (day !== lastDay) {
        result.push({ key: `day-${day}-${message.id}`, type: 'day', label: day })
        lastDay = day
        lastSenderId = null
        lastAt = 0
      }
      if (!dividerPlaced && unreadDividerId && message.id === unreadDividerId) {
        result.push({ key: `unread-${message.id}`, type: 'unread' })
        dividerPlaced = true
        lastSenderId = null
        lastAt = 0
      }
      const senderId = message.sender?.id ?? 'unknown'
      const at = Date.parse(message.createdAt)
      const compact =
        senderId === lastSenderId &&
        at - lastAt < GROUP_WINDOW_MS &&
        message.deletedAt === null
      result.push({ key: message.id, type: 'message', message, compact })
      lastSenderId = senderId
      lastAt = at
    }
    return result
  }, [messages, unreadDividerId])

  // ── scroll behavior ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const count = messages.length
    const prevCount = lastMessageCountRef.current
    lastMessageCountRef.current = count

    if (prevCount === 0) {
      // initial load — jump to bottom instantly
      container.scrollTop = container.scrollHeight
      return
    }
    if (count > prevCount) {
      const last = messages[messages.length - 1]
      const isMine = !!me && last?.sender?.id === me.id
      if (pinnedToBottom || isMine) {
        container.scrollTop = container.scrollHeight
      } else {
        // defer the pill state so the effect stays render-safe
        requestAnimationFrame(() => setNewArrival(true))
      }
      return
    }
    // older messages prepended — keep scroll position stable
    if (count < prevCount) lastMessageCountRef.current = count
  }, [messages, me, pinnedToBottom])

  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const atBottom = distanceToBottom < 80
    if (atBottom) {
      setPinnedToBottom(true)
      setNewArrival(false)
    } else if (pinnedToBottom) {
      setPinnedToBottom(false)
    }
    if (container.scrollTop < 120 && hasMore && !loadingOlder && channelId) {
      void loadOlder(channelId)
    }
  }

  const scrollToBottom = (smooth = true) => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
    setNewArrival(false)
  }

  // ── jump to message (from search) ──────────────────────────────────────────
  useEffect(() => {
    if (!jumpToMessageId || !messages.length) return
    const element = document.getElementById(`message-${jumpToMessageId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const id = jumpToMessageId
      requestAnimationFrame(() => {
        setFlashId(id)
        setTimeout(() => {
          setFlashId((current) => (current === id ? null : current))
        }, 2100)
      })
      setJumpToMessageId(null)
    } else if (hasMore && !loading && !loadingOlder && channelId) {
      // target is older than the loaded window — fetch more history
      void loadOlder(channelId)
    } else if (!hasMore) {
      // no more history — give up quietly
      setJumpToMessageId(null)
    }
  }, [jumpToMessageId, messages, hasMore, loading, loadingOlder, channelId, loadOlder, setJumpToMessageId])

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 space-y-6 overflow-hidden px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading messages">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className={cn('h-3.5', index % 3 === 0 ? 'w-3/4' : index % 3 === 1 ? 'w-1/2' : 'w-2/3')} />
              {index % 4 === 0 && <Skeleton className="h-3.5 w-1/3" />}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden pb-4"
        role="log"
        aria-label="Messages"
      >
        {/* load older indicator */}
        <div className="flex justify-center py-2">
          {loadingOlder ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading older messages" />
          ) : hasMore ? (
            <span className="text-[10px] text-muted-foreground/60">scroll up for older messages</span>
          ) : messages.length > 0 ? (
            <span className="text-[10px] font-medium text-muted-foreground/60">This is the beginning</span>
          ) : null}
        </div>

        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-lg font-bold">No messages yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Be the first to say hello — or mention an AI teammate to get things moving.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            if (entry.type === 'day') {
              return (
                <div key={entry.key} className="sticky top-0 z-10 flex justify-center px-4 py-2 md:px-6">
                  <span className="rounded-full border border-border bg-background/90 px-3 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
                    {entry.label}
                  </span>
                </div>
              )
            }
            if (entry.type === 'unread') {
              return (
                <div key={entry.key} className="flex items-center gap-3 px-4 py-2.5 md:px-6" aria-label="New messages">
                  <span className="h-px flex-1 bg-emerald-500/50" aria-hidden />
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    New
                  </span>
                  <span className="h-px flex-1 bg-emerald-500/50" aria-hidden />
                </div>
              )
            }
            return (
              <MessageItem
                key={entry.key}
                message={entry.message!}
                compact={entry.compact}
                highlight={flashId === entry.message!.id}
              />
            )
          })
        )}
        <div ref={bottomRef} className="h-px" aria-hidden />
      </div>

      {/* scroll-to-bottom / jump to latest */}
      <AnimatePresence>
        {(newArrival || (!pinnedToBottom && !loading)) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
          >
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className={cn(
                'pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors duration-150 hover:bg-accent',
                newArrival
                  ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                  : 'text-muted-foreground',
              )}
              aria-label={newArrival ? 'Jump to latest messages' : 'Scroll to bottom'}
            >
              <ArrowDown className={cn('h-3.5 w-3.5', newArrival && 'animate-bounce')} aria-hidden />
              {newArrival ? 'Jump to latest' : 'Scroll to bottom'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
