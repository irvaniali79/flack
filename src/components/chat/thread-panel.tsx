'use client'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, Hash, Loader2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
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
  const following = useChatStore((s) => (rootId ? !!s.threadFollowing[rootId] : false))
  const followerCount = useChatStore((s) => (rootId ? s.threadFollowerCount[rootId] ?? 0 : 0))
  const toggleThreadFollow = useChatStore((s) => s.toggleThreadFollow)
  const [followBusy, setFollowBusy] = useState(false)

  // Fetch reply list when a thread opens
  useEffect(() => {
    if (!rootId) return
    void useChatStore.getState().openThread(rootId)
  }, [rootId])

  const root = useMemo(() => messages.find((m) => m.id === rootId) ?? null, [messages, rootId])

  const toggleFollow = async () => {
    if (!rootId || followBusy) return
    setFollowBusy(true)
    const next = !following
    try {
      await toggleThreadFollow(rootId, next)
      toast.success(
        next
          ? 'Following this thread — you will be notified about new replies'
          : 'Unfollowed this thread',
        { description: next ? undefined : 'Existing notifications stay put.' },
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update follow state')
    } finally {
      setFollowBusy(false)
    }
  }

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
          onClick={() => void toggleFollow()}
          aria-pressed={following}
          aria-label={following ? 'Unfollow this thread' : 'Follow this thread'}
          title={
            following
              ? "You're following — new replies notify you (click to unfollow)"
              : 'Follow — get notified about new replies'
          }
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all duration-150 active:scale-95',
            following
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400'
              : 'border-border text-muted-foreground hover:border-emerald-500/40 hover:bg-accent hover:text-foreground',
          )}
        >
          {following ? (
            <BellRing className="h-3.5 w-3.5 animate-[bell-ring_0.9s_ease-out_1]" aria-hidden />
          ) : (
            <Bell className="h-3.5 w-3.5" aria-hidden />
          )}
          {following ? 'Following' : 'Follow'}
        </button>
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
            {followerCount > 0 && (
              <span
                className="ml-auto flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={`${followerCount} ${followerCount === 1 ? 'person is' : 'people are'} following this thread`}
              >
                <Users className="h-3 w-3" aria-hidden />
                {followerCount} following
              </span>
            )}
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
