'use client'
import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Hash, Loader2, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { getActiveChannel, useChatStore } from '@/lib/store'
import { MessageItem } from './message-item'
import { Composer } from './composer'
import { EmptyThreadState } from './empty-states'
import { UserAvatar } from './avatar'
import { SummaryTrigger } from './agents/summary-dialog'

export function ThreadPanel() {
  const isMobile = useIsMobile()
  const channel = useChatStore(getActiveChannel)
  const rootId = useChatStore((s) => s.activeThreadRootId)
  const closeThread = useChatStore((s) => s.closeThread)
  const messages = useChatStore((s) => (channel ? s.messagesByChannel[channel.id] : undefined)) ?? []
  const replies = useChatStore((s) => (rootId ? s.threadReplies[rootId] : undefined))
  const loading = useChatStore((s) => s.threadLoading)

  // Fetch reply list when a thread opens
  useEffect(() => {
    if (!rootId) return
    void useChatStore.getState().openThread(rootId)
  }, [rootId])

  const root = useMemo(() => messages.find((m) => m.id === rootId) ?? null, [messages, rootId])

  const participants = useMemo(() => {
    const senders = new Map<string, NonNullable<typeof replies>[number]['sender']>()
    if (root?.sender) senders.set(root.sender.id, root.sender)
    for (const reply of replies ?? []) {
      if (reply.sender) senders.set(reply.sender.id, reply.sender)
    }
    return [...senders.values()]
  }, [root, replies])

  if (!rootId) return null

  const channelLabel = channel
    ? channel.kind === 'dm' || channel.kind === 'group_dm'
      ? 'Direct message'
      : `#${channel.name}`
    : ''

  const content = (
    <>
      {/* header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-tight">Thread</h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {channel && channel.kind !== 'dm' && channel.kind !== 'group_dm' && (
              <Hash className="h-3 w-3" aria-hidden />
            )}
            {channelLabel}
          </p>
        </div>
        <SummaryTrigger
          channelId={channel?.id ?? null}
          threadOf={rootId}
          variant="icon"
          title="Thread summary"
          loadingLabel="Reading the thread…"
        />
        <button
          type="button"
          aria-label="Close thread"
          onClick={closeThread}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 md:px-3">
        {root ? (
          <MessageItem message={root} inThread />
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading thread" />
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Thread message not found.
          </p>
        )}

        {(replies?.length ?? 0) > 0 && (
          <>
            <div className="my-3 flex items-center gap-2 px-2" aria-hidden>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {replies!.length} {replies!.length === 1 ? 'reply' : 'replies'}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-0.5">
              {replies!.map((reply) => (
                <MessageItem key={reply.id} message={reply} inThread />
              ))}
            </div>
          </>
        )}
        {!loading && (replies?.length ?? 0) === 0 && <EmptyThreadState />}

        {/* participants */}
        {participants.length > 0 && (
          <div className="mt-4 flex items-center gap-2 border-t border-border px-2 pt-3">
            <span className="flex -space-x-1.5">
              {participants.slice(0, 5).map((sender) => (
                <UserAvatar
                  key={sender!.id}
                  user={sender!}
                  size="xs"
                  className="ring-2 ring-background"
                />
              ))}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
            </span>
          </div>
        )}
      </div>

      {/* reply composer */}
      <Composer parentId={rootId} placeholder="Reply in thread…" />
    </>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          key="thread-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      <motion.aside
        key="thread-panel"
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 400, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
        className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background"
        aria-label="Thread panel"
      >
        <div className={cn('flex h-full w-[400px] flex-col')}>{content}</div>
      </motion.aside>
    </AnimatePresence>
  )
}
