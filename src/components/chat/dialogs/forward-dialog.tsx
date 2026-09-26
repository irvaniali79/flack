'use client'
// Forward (share) a message to another channel or DM.
// Targets: channels I'm a member of (postable). The forwarded message is a
// blockquote of the original with an optional note — mentions in the note
// notify as usual, mentions inside the quote do not (Slack share semantics).
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Hash, Loader2, Lock, Search, Send, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import type { ChannelDTO, MessageDTO } from '@/lib/types'
import { UserAvatar } from '../avatar'

function channelIcon(channel: ChannelDTO) {
  if (channel.kind === 'dm' || channel.kind === 'group_dm') return null
  if (channel.kind === 'private') return <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
  return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
}

function channelLabel(channel: ChannelDTO) {
  return channel.kind === 'dm' || channel.kind === 'group_dm'
    ? channel.members?.map((m) => m.name).join(', ') ?? channel.name
    : channel.name
}

export function ForwardDialog() {
  const forwardingMessageId = useChatStore((s) => s.forwardingMessageId)
  const setForwardingMessageId = useChatStore((s) => s.setForwardingMessageId)
  const channels = useChatStore((s) => s.channels)
  const users = useChatStore((s) => s.users)
  const openChannel = useChatStore((s) => s.openChannel)
  const me = useChatStore((s) => s.me)

  const open = !!forwardingMessageId

  // Locate the source message in loaded channels (or saved extras)
  const message = useMemo<MessageDTO | null>(() => {
    if (!forwardingMessageId) return null
    const state = useChatStore.getState()
    for (const list of Object.values(state.messagesByChannel)) {
      const hit = list.find((m) => m.id === forwardingMessageId)
      if (hit) return hit
    }
    for (const list of Object.values(state.threadReplies)) {
      const hit = list.find((m) => m.id === forwardingMessageId)
      if (hit) return hit
    }
    return state.savedExtras[forwardingMessageId] ?? null
  }, [forwardingMessageId])

  const sourceChannel = useMemo(
    () => channels.find((c) => c.id === message?.channelId) ?? null,
    [channels, message],
  )

  // Postable targets: channels I'm a member of, not archived, not the source channel itself
  const targets = useMemo(() => {
    const list = channels.filter((c) => c.isMember && !c.isArchived && c.id !== message?.channelId)
    return [...list].sort((a, b) => {
      const kindOrder = (k: ChannelDTO['kind']) => (k === 'dm' || k === 'group_dm' ? 1 : 0)
      const byKind = kindOrder(a.kind) - kindOrder(b.kind)
      return byKind !== 0 ? byKind : a.name.localeCompare(b.name)
    })
  }, [channels, message])

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when the dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setNote('')
      setSelectedId(null)
      setSending(false)
      // Autofocus the search box next frame
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((c) => {
      const label = channelLabel(c).toLowerCase()
      return label.includes(q) || c.name.toLowerCase().includes(q)
    })
  }, [targets, query])

  const selected = targets.find((c) => c.id === selectedId) ?? null

  const senderName = message?.sender?.name ?? 'Unknown'
  const sourceWhere = sourceChannel
    ? sourceChannel.kind === 'dm' || sourceChannel.kind === 'group_dm'
      ? 'a DM'
      : `#${sourceChannel.name}`
    : 'a channel'

  const forward = async () => {
    if (!forwardingMessageId || !selected || sending) return
    setSending(true)
    try {
      const data = await api<{ targetChannel: { id: string; name: string } }>(
        `/api/messages/${forwardingMessageId}/forward`,
        { method: 'POST', body: { channelId: selected.id, note: note.trim() || undefined } },
      )
      const targetName =
        selected.kind === 'dm' || selected.kind === 'group_dm'
          ? channelLabel(selected)
          : `#${data.targetChannel.name}`
      toast.success(`Forwarded to ${targetName}`, {
        description: 'The original is quoted; your note (if any) is included.',
        action: {
          label: 'View',
          onClick: () => void openChannel(data.targetChannel.id),
        },
      })
      setForwardingMessageId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not forward the message')
      setSending(false)
    }
  }

  // ⌘/Ctrl+Enter to send
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selected && !sending) {
      e.preventDefault()
      void forward()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setForwardingMessageId(null)}>
      <DialogContent className="max-h-[calc(85vh/var(--ui-scale))] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Forward message
          </DialogTitle>
          <DialogDescription className="text-xs">
            Share it in a channel or DM — the original is quoted, with an optional note from you.
          </DialogDescription>
        </DialogHeader>

        {/* source preview */}
        {message && (
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
              {senderName} · {sourceWhere}
            </p>
            <p className="max-h-16 overflow-hidden text-[13px] leading-snug text-foreground/80">
              {message.body.split('\n')[0].slice(0, 140)}
              {message.body.length > 140 ? '…' : ''}
            </p>
          </div>
        )}

        {/* target picker */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-5 pt-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search channels and people…"
                className="h-9 rounded-lg pl-9"
                aria-label="Search channels and people"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto px-3 py-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {targets.length === 0
                  ? 'No other channels to forward to yet.'
                  : 'No matches — try another name.'}
              </p>
            ) : (
              filtered.map((channel) => {
                const selectedRow = selectedId === channel.id
                const label = channelLabel(channel)
                const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setSelectedId(channel.id)}
                    aria-pressed={selectedRow}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100',
                      selectedRow ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'hover:bg-accent',
                    )}
                  >
                    {isDm && channel.members && channel.members.length > 0 ? (
                      <span className="flex h-7 w-7 shrink-0 -space-x-1.5">
                        {channel.members.slice(0, 2).map((m) => (
                          <UserAvatar key={m.id} user={m} size="xs" className="ring-2 ring-background" />
                        ))}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          selectedRow
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {isDm ? <Users className="h-4 w-4" aria-hidden /> : channelIcon(channel)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {isDm ? 'Direct message' : channel.kind === 'private' ? 'Private channel' : 'Public channel'}
                        {channel.unread > 0 ? ` · ${channel.unread} unread` : ''}
                      </span>
                    </span>
                    <AnimatePresence>
                      {selectedRow && (
                        <motion.span
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
                        >
                          ✓
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )
              })
            )}
          </div>

          {/* note */}
          <div className="border-t border-border px-5 py-3">
            <label htmlFor="forward-note" className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
              Add a note <span className="font-normal">(optional — {me?.kind === 'human' ? 'mentions notify' : 'plain text'})</span>
            </label>
            <Textarea
              id="forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Why you're sharing this…"
              className="min-h-[64px] resize-none rounded-lg text-[13px]"
              maxLength={4000}
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {selected ? (
              <>
                Sending to
                <span className="font-semibold text-foreground">{channelLabel(selected)}</span>
              </>
            ) : (
              'Pick a destination to send'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setForwardingMessageId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={!selected || sending}
              onClick={() => void forward()}
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Forwarding…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" aria-hidden /> Forward
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
