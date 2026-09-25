'use client'
import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Copy,
  CornerDownRight,
  Download,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Smile,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import type { MessageDTO } from '@/lib/types'
import { formatBytes } from '@/lib/api'
import { formatTime, formatTimeHover } from '@/lib/time'
import { MarkdownBody } from '@/lib/markdown'
import { UserAvatar } from './avatar'
import { FileIcon } from './file-icon'
import { EmojiPicker } from './emoji-picker'

const QUICK_REACTIONS = ['👍', '🎉', '👀', '❤️']

export const MessageItem = memo(function MessageItem({
  message,
  compact = false,
  inThread = false,
  highlight = false,
}: {
  message: MessageDTO
  compact?: boolean
  inThread?: boolean
  highlight?: boolean
}) {
  const me = useChatStore((s) => s.me)
  const users = useChatStore((s) => s.users)
  const channels = useChatStore((s) => s.channels)
  const toggleReaction = useChatStore((s) => s.toggleReaction)
  const togglePin = useChatStore((s) => s.togglePin)
  const openThread = useChatStore((s) => s.openThread)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)
  const setImageViewer = useChatStore((s) => s.setImageViewer)
  const setEditingMessageId = useChatStore((s) => s.setEditingMessageId)
  const activeThreadRootId = useChatStore((s) => s.activeThreadRootId)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reacting, setReacting] = useState(false)

  const sender = message.sender
  const isMine = !!me && sender?.id === me.id
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const mentionsMe =
    !!me && (message.mentions.userIds.includes(me.id) || message.mentions.specials.length > 0)
  const isAgent = sender?.kind === 'agent'
  const deleted = !!message.deletedAt
  const canEdit = isMine && !deleted
  const canDelete = (isMine || isAdmin) && !deleted

  const react = async (emoji: string) => {
    if (reacting) return
    setReacting(true)
    try {
      await toggleReaction(message.id, emoji)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not react')
    } finally {
      setReacting(false)
    }
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.body)
      toast.success('Copied message text')
    } catch {
      toast.error('Copy failed')
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?channel=${message.channelId}&message=${message.id}`,
      )
      toast.success('Link copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  if (deleted) {
    return (
      <div
        className={cn('group relative flex gap-3 px-4 py-1 md:px-6', compact && 'py-0.5')}
        id={`message-${message.id}`}
      >
        {!compact && <div className="w-9 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1 py-1">
          <p className="text-[13px] italic text-muted-foreground/80">This message was deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        'group relative flex gap-3 px-4 py-1 transition-colors duration-150 hover:bg-muted/40 md:px-6',
        compact ? 'py-0.5' : 'mt-2 py-1.5',
        mentionsMe &&
          'border-l-[3px] border-amber-400/80 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/70',
        highlight && 'flash-highlight',
      )}
    >
      {/* avatar / gutter */}
      <div className="w-9 shrink-0 pt-0.5">
        {compact ? (
          <span className="hidden select-none text-right text-[10px] leading-5 text-muted-foreground/0 group-hover:text-muted-foreground md:block">
            {formatTime(message.createdAt)}
          </span>
        ) : sender ? (
          <button
            type="button"
            aria-label={`View ${sender.name}'s profile`}
            onClick={() => setProfileUserId(sender.id)}
            className="transition-transform duration-150 hover:scale-105"
          >
            <UserAvatar user={sender} size="md" />
          </button>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
            ?
          </div>
        )}
      </div>

      {/* body */}
      <div className="min-w-0 flex-1 pb-0.5">
        {!compact && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <button
              type="button"
              onClick={() => sender && setProfileUserId(sender.id)}
              className="text-[14px] font-bold leading-6 hover:underline"
            >
              {sender?.name ?? 'Unknown'}
            </button>
            {isAgent && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
              </span>
            )}
            <time
              dateTime={message.createdAt}
              title={formatTimeHover(message.createdAt)}
              className="text-[11px] text-muted-foreground"
            >
              {formatTime(message.createdAt)}
            </time>
            {message.editedAt && (
              <span className="text-[10px] text-muted-foreground">(edited)</span>
            )}
            {message.isPinned && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                <Pin className="h-3 w-3" aria-hidden /> pinned
              </span>
            )}
          </div>
        )}

        {compact && (
          <time
            dateTime={message.createdAt}
            title={formatTimeHover(message.createdAt)}
            className="mr-1.5 hidden select-none text-[10px] align-baseline text-muted-foreground/0 group-hover:text-muted-foreground sm:inline"
          >
            {formatTime(message.createdAt)}
          </time>
        )}

        <MarkdownBody
          body={message.body}
          users={users}
          channels={channels}
          onOpenProfile={(userId) => setProfileUserId(userId)}
          onOpenChannel={(channelId) => void useChatStore.getState().openChannel(channelId)}
          className="min-w-0"
        />

        {/* files */}
        {message.files.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {message.files.map((file) =>
              file.mimeType.startsWith('image/') ? (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setImageViewer({ url: `/api/files/${file.id}`, name: file.name, size: file.size })}
                  className="group/img relative w-fit max-w-full"
                  aria-label={`View image ${file.name}`}
                >
                  <img
                    src={`/api/files/${file.id}`}
                    alt={file.name}
                    className="max-h-80 max-w-full cursor-zoom-in rounded-xl border border-border object-contain transition-opacity duration-150 group-hover/img:opacity-90"
                  />
                </button>
              ) : (
                <a
                  key={file.id}
                  href={`/api/files/${file.id}`}
                  download={file.name}
                  className="flex w-fit max-w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 transition-colors duration-150 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-emerald-600 dark:text-emerald-400">
                    <FileIcon mimeType={file.mimeType} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </span>
                  <Download className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              ),
            )}
          </div>
        )}

        {/* reactions */}
        {message.reactions.length > 0 && (
          <TooltipProvider delayDuration={200}>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {message.reactions.map((reaction) => {
                const mine = !!me && reaction.users.some((u) => u.id === me.id)
                return (
                  <Tooltip key={reaction.emoji}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void react(reaction.emoji)}
                        aria-label={`React ${reaction.emoji} — ${reaction.count}`}
                        className={cn(
                          'flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-all duration-150',
                          mine
                            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-border bg-muted/50 text-foreground/80 hover:border-border hover:bg-muted',
                        )}
                      >
                        <span className="text-sm leading-none">{reaction.emoji}</span>
                        {reaction.count}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {reaction.users.map((u) => u.name).join(', ')} reacted with {reaction.emoji}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Add reaction"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground opacity-0 transition-all duration-150 hover:border-emerald-500/50 hover:text-emerald-600 group-hover:opacity-100 dark:hover:text-emerald-400"
                  >
                    <Smile className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 rounded-xl p-0">
                  <EmojiPicker onSelect={(char) => void react(char)} />
                </PopoverContent>
              </Popover>
            </div>
          </TooltipProvider>
        )}

        {/* thread indicator */}
        {!inThread && message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => void openThread(message.id)}
            className="mt-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-500/10 dark:text-emerald-400"
            aria-label={`Open thread — ${message.replyCount} replies`}
          >
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
            <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] font-bold">
              {message.replyCount}
            </span>
            <span className="text-muted-foreground">
              {message.replyCount === 1 ? 'reply' : 'replies'}
            </span>
          </button>
        )}
      </div>

      {/* hover toolbar */}
      <div
        className={cn(
          'absolute -top-3 right-4 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 md:right-6',
          inThread && 'right-2',
        )}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => void react(emoji)}
            aria-label={`React ${emoji}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-transform duration-100 hover:scale-125 hover:bg-accent"
          >
            {emoji}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More reactions"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Smile className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl p-0">
            <EmojiPicker onSelect={(char) => void react(char)} />
          </PopoverContent>
        </Popover>
        {!inThread && (
          <button
            type="button"
            onClick={() => void openThread(message.id)}
            aria-label="Reply in thread"
            title={activeThreadRootId === message.id ? 'Thread open' : 'Reply in thread'}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground',
              activeThreadRootId === message.id && 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More message actions"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl">
            <DropdownMenuItem className="gap-2" onClick={() => void togglePin(message.id, !message.isPinned)}>
              {message.isPinned ? (
                <PinOff className="h-4 w-4" aria-hidden />
              ) : (
                <Pin className="h-4 w-4" aria-hidden />
              )}
              {message.isPinned ? 'Unpin message' : 'Pin message'}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => void copyText()}>
              <Copy className="h-4 w-4" aria-hidden /> Copy text
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => void copyLink()}>
              <LinkIcon className="h-4 w-4" aria-hidden /> Copy link
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onClick={() => setEditingMessageId(message.id)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit message
                </DropdownMenuItem>
              </>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-rose-600 focus:text-rose-600 dark:focus:text-rose-400"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete message
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be replaced with a placeholder for everyone in the channel. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => {
                setConfirmDelete(false)
                void useChatStore
                  .getState()
                  .deleteMessage(message.id)
                  .then(() => toast.success('Message deleted'))
                  .catch((err: Error) => toast.error(err.message))
              }}
            >
              {false && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
