'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  Bold,
  Check,
  Code,
  Drama,
  FileUp,
  Info,
  Italic,
  Laugh,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
  Slash,
  Smile,
  Sparkles,
  Strikethrough,
  Table,
  TextQuote,
  Undo,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getActiveChannel, useChatStore } from '@/lib/store'
import type { UserDTO } from '@/lib/types'
import { formatBytes, uploadFile, type UploadedFile } from '@/lib/api'
import { UserAvatar } from './avatar'
import { EmojiPicker } from './emoji-picker'

// ─── typing indicator ────────────────────────────────────────────────────────

export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useChatStore((s) => s.typing[channelId])
  const me = useChatStore((s) => s.me)
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const entries = Object.entries(typing ?? {})
    .filter(([userId, entry]) => userId !== me?.id && Date.now() - entry.at < 4000)
    .map(([, entry]) => entry)

  if (entries.length === 0) return null
  const agent = entries.find((entry) => entry.kind === 'agent')

  return (
    <div className="flex items-center gap-2 px-4 pb-1 text-xs text-muted-foreground md:px-5" aria-live="polite">
      {agent ? (
        <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
      ) : (
        <span className="flex gap-0.5" aria-hidden>
          <span className="typing-dot h-1 w-1 rounded-full bg-emerald-500" />
          <span className="typing-dot h-1 w-1 rounded-full bg-emerald-500" />
          <span className="typing-dot h-1 w-1 rounded-full bg-emerald-500" />
        </span>
      )}
      {entries.length === 1
        ? `${entries[0].name} is ${agent ? 'thinking…' : 'typing…'}`
        : agent
          ? `${agent.name} is thinking…`
          : `${entries.length} people are typing…`}
    </div>
  )
}

// ─── mention / channel / slash menus ───────────────────────────────────────

interface MenuState {
  kind: 'mention' | 'channel' | 'slash'
  query: string
  start: number
}

interface SlashCommand {
  command: string
  args?: string
  description: string
  icon: LucideIcon
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/me', args: '<text>', description: 'Send an italic action message', icon: Drama },
  { command: '/shrug', description: 'Appends ¯\\_(ツ)_/¯ to the message', icon: Laugh },
  { command: '/tableflip', description: 'Appends (╯°□°)╯︵ ┻━┻', icon: Table },
  { command: '/unflip', description: 'Appends ┬─┬ ノ( ゜-゜ノ)', icon: Undo },
  { command: '/topic', args: '<text>', description: 'Update this channel’s topic', icon: Info },
]

function SlashMenu({
  commands,
  activeIndex,
  onSelect,
  onClose,
}: {
  commands: SlashCommand[]
  activeIndex: number
  onSelect: (command: string) => void
  onClose: () => void
}) {
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <p className="border-b border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Commands
      </p>
      <div className="max-h-60 overflow-y-auto p-1">
        {commands.map((entry, index) => {
          const Icon = entry.icon
          return (
            <button
              key={entry.command}
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
                activeIndex === index ? 'bg-accent' : 'hover:bg-accent',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(entry.command)}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                  activeIndex === index
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-semibold">
                  {entry.command}
                  {entry.args && <span className="font-sans font-normal text-muted-foreground"> {entry.args}</span>}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{entry.description}</span>
              </span>
            </button>
          )
        })}
        {commands.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">No matching commands</p>
        )}
      </div>
      <button
        type="button"
        className="w-full border-t border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-accent"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
      >
        Esc to dismiss
      </button>
    </div>
  )
}

function MentionMenu({
  users,
  query,
  onSelect,
  onClose,
  activeIndex,
}: {
  users: UserDTO[]
  query: string
  onSelect: (user: UserDTO | 'channel' | 'here') => void
  onClose: () => void
  activeIndex: number
}) {
  const q = query.toLowerCase()
  const filtered = users
    .filter((user) => !q || user.name.toLowerCase().includes(q) || (user.handle ?? '').toLowerCase().includes(q))
    .slice(0, 7)

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <p className="border-b border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Mention
      </p>
      <div className="max-h-60 overflow-y-auto p-1">
        {q.length >= 2 && (
          <>
            <MenuItem
              label="@channel"
              description="Notify everyone in this channel"
              special
              active={activeIndex === 0}
              onSelect={() => onSelect('channel')}
            />
            <MenuItem
              label="@here"
              description="Notify people active now"
              special
              active={activeIndex === 1}
              onSelect={() => onSelect('here')}
            />
          </>
        )}
        {filtered.map((user, index) => (
          <button
            key={user.id}
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
              activeIndex === index + (q.length >= 2 ? 2 : 0) ? 'bg-accent' : 'hover:bg-accent',
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(user)}
          >
            <UserAvatar user={user} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{user.name}</span>
              {user.handle && (
                <span className="block truncate text-[11px] text-muted-foreground">@{user.handle}</span>
              )}
            </span>
            {user.kind === 'agent' && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && q.length >= 2 && null}
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">No matches</p>
        )}
      </div>
      <button
        type="button"
        className="w-full border-t border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-accent"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
      >
        Esc to dismiss
      </button>
    </div>
  )
}

function MenuItem({
  label,
  description,
  special,
  active,
  onSelect,
}: {
  label: string
  description: string
  special?: boolean
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
        active ? 'bg-accent' : 'hover:bg-accent',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold',
          special ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted',
        )}
        aria-hidden
      >
        @
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

// ─── composer ────────────────────────────────────────────────────────────────

export function Composer({ parentId, placeholder }: { parentId?: string; placeholder?: string }) {
  const channel = useChatStore(getActiveChannel)
  const channelId = channel?.id ?? ''
  const me = useChatStore((s) => s.me)
  const users = useChatStore((s) => s.users)
  const channels = useChatStore((s) => s.channels)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const editMessage = useChatStore((s) => s.editMessage)
  const emitTyping = useChatStore((s) => s.emitTyping)
  const updateChannel = useChatStore((s) => s.updateChannel)
  const drafts = useChatStore((s) => s.drafts)
  const setDraft = useChatStore((s) => s.setDraft)
  const editingMessageId = useChatStore((s) => s.editingMessageId)
  const setEditingMessageId = useChatStore((s) => s.setEditingMessageId)
  const messages = useChatStore((s) => (channelId ? s.messagesByChannel[channelId] : undefined)) ?? []
  const threadReplies = useChatStore((s) => (s.activeThreadRootId ? s.threadReplies[s.activeThreadRootId] : undefined))

  const draftKey = parentId ? `${channelId}-thread-${parentId}` : channelId
  const [text, setText] = useState('')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingEmit = useRef(0)

  // editing state: load message into the box
  const editingMessage = useMemo(() => {
    if (!editingMessageId) return null
    const inChannel = messages.find((m) => m.id === editingMessageId)
    const inThread = threadReplies?.find((m) => m.id === editingMessageId)
    return inChannel ?? inThread ?? null
  }, [editingMessageId, messages, threadReplies])

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.body)
      textareaRef.current?.focus()
    }
  }, [editingMessage])

  // restore draft when channel changes (skip when editing)
  useEffect(() => {
    if (!editingMessage) {
      setText(drafts[draftKey] ?? '')
    }
    setFiles([])
    setMenu(null)
  }, [draftKey])

  const isAgentDm = channel?.kind === 'dm' && channel.members?.some((m) => m.kind === 'agent')

  const mentionFiltered = useMemo(() => {
    if (!menu || menu.kind !== 'mention') return []
    const q = menu.query.toLowerCase()
    return users
      .filter((user) => !q || user.name.toLowerCase().includes(q) || (user.handle ?? '').toLowerCase().includes(q))
      .slice(0, 7)
  }, [menu, users])

  const channelFiltered = useMemo(() => {
    if (!menu || menu.kind !== 'channel') return []
    const q = menu.query.toLowerCase()
    return channels
      .filter(
        (c) =>
          c.kind !== 'dm' && c.kind !== 'group_dm' && (c.slug.includes(q) || c.name.toLowerCase().includes(q)),
      )
      .slice(0, 7)
  }, [menu, channels])

  const slashFiltered = useMemo(() => {
    if (!menu || menu.kind !== 'slash') return []
    const q = menu.query.toLowerCase()
    if (!q) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter(
      (entry) => entry.command.slice(1).toLowerCase().startsWith(q),
    )
  }, [menu])

  const autosize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(autosize, [text])

  const detectMenu = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    // slash commands — only while the caret is inside the leading command token
    const slashMatch = /^\/([a-z]*)$/i.exec(before)
    if (slashMatch) {
      setMenu({ kind: 'slash', query: slashMatch[1], start: 0 })
      setMenuIndex(0)
      return
    }
    const mentionMatch = /(^|\s)@([a-zA-Z0-9_]*)$/.exec(before)
    if (mentionMatch) {
      setMenu({ kind: 'mention', query: mentionMatch[2], start: caret - mentionMatch[2].length - 1 })
      setMenuIndex(0)
      return
    }
    const channelMatch = /(^|\s)#([a-z0-9-]*)$/i.exec(before)
    if (channelMatch) {
      setMenu({ kind: 'channel', query: channelMatch[2], start: caret - channelMatch[2].length - 1 })
      setMenuIndex(0)
      return
    }
    setMenu(null)
  }

  const handleChange = (value: string) => {
    setText(value)
    if (!editingMessage) setDraft(draftKey, value)
    const el = textareaRef.current
    detectMenu(value, el?.selectionStart ?? value.length)

    if (!editingMessage && value.trim()) {
      const now = Date.now()
      if (now - lastTypingEmit.current > 2000) {
        lastTypingEmit.current = now
        if (channelId) emitTyping(channelId)
      }
    }
  }

  const insertAtCaret = (insert: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = text.slice(0, start) + insert + text.slice(end)
    handleChange(next)
    requestAnimationFrame(() => {
      const caret = start + insert.length
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const wrapSelection = (before: string, after = before, placeholderText = 'text') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = text.slice(start, end) || placeholderText
    const next = text.slice(0, start) + before + selected + after + text.slice(end)
    handleChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const selectMention = (selection: UserDTO | 'channel' | 'here') => {
    if (!menu) return
    const el = textareaRef.current
    const label =
      selection === 'channel' ? '@channel' : selection === 'here' ? '@here' : `@${selection.name}`
    const value = text.slice(0, menu.start) + label + ' '
    const next = value + text.slice((el?.selectionStart ?? menu.start + menu.query.length + 1))
    setMenu(null)
    handleChange(next)
    requestAnimationFrame(() => {
      const caret = value.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const selectChannel = (slug: string) => {
    if (!menu) return
    const el = textareaRef.current
    const value = text.slice(0, menu.start) + `#${slug} `
    const next = value + text.slice((el?.selectionStart ?? menu.start + menu.query.length + 1))
    setMenu(null)
    handleChange(next)
    requestAnimationFrame(() => {
      const caret = value.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const selectCommand = (command: string) => {
    if (!menu) return
    const el = textareaRef.current
    // strip the partial command token, keep anything after it
    const rest = text.replace(/^\/\S*\s?/, '')
    const next = `${command} ${rest}`
    setMenu(null)
    handleChange(next)
    requestAnimationFrame(() => {
      const caret = command.length + 1
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const uploadFiles = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is over the 25 MB limit`)
        continue
      }
      setUploading((n) => n + 1)
      try {
        const uploaded = await uploadFile(file)
        setFiles((prev) => [...prev, uploaded])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const clearComposer = () => {
    setText('')
    setDraft(draftKey, '')
    setFiles([])
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.focus()
      }
    })
  }

  // ── slash commands — returns true when the send was consumed ────────────
  const runSlashCommand = async (raw: string): Promise<boolean> => {
    const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(raw)
    if (!match) return false
    const name = match[1].toLowerCase()
    const arg = (match[2] ?? '').trim()
    const fileIds = files.length > 0 ? files.map((f) => f.id) : undefined
    try {
      if (name === 'me') {
        if (!arg) {
          toast.error('Usage: /me <text>')
          return true
        }
        await sendMessage(`*${arg}*`, fileIds, parentId)
        clearComposer()
        return true
      }
      if (name === 'shrug' || name === 'tableflip' || name === 'unflip') {
        const emote =
          name === 'shrug' ? '¯\\_(ツ)_/¯' : name === 'tableflip' ? '(╯°□°)╯︵ ┻━┻' : '┬─┬ ノ( ゜-゜ノ)'
        await sendMessage(arg ? `${arg} ${emote}` : emote, fileIds, parentId)
        clearComposer()
        return true
      }
      if (name === 'topic') {
        if (!arg) {
          toast.error('Usage: /topic <text>')
          return true
        }
        if (!channelId) return true
        await updateChannel(channelId, { topic: arg })
        toast.success('Topic updated')
        clearComposer()
        return true
      }
      toast.error(`Unknown command: /${name}`)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Command failed')
      return true
    }
  }

  const submit = async () => {
    const body = text.trim()
    if (!body && files.length === 0) return
    if (!body) return
    if (!channelId) return
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, body)
        toast.success('Message updated')
        return
      }
      if (body.startsWith('/')) {
        const consumed = await runSlashCommand(body)
        if (consumed) return
      }
      await sendMessage(body, files.length > 0 ? files.map((f) => f.id) : undefined, parentId)
      clearComposer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send message')
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMenuIndex((i) => i + 1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMenuIndex((i) => Math.max(0, i - 1))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        if (menu.kind === 'slash') {
          const entry = slashFiltered[Math.min(menuIndex, slashFiltered.length - 1)]
          if (entry) selectCommand(entry.command)
          return
        }
        if (menu.kind === 'mention') {
          const q = menu.query.toLowerCase()
          const filtered = users.filter(
            (user) => !q || user.name.toLowerCase().includes(q) || (user.handle ?? '').includes(q),
          )
          const offset = q.length >= 2 ? 2 : 0
          if (menuIndex === 0 && q.length >= 2) selectMention('channel')
          else if (menuIndex === 1 && q.length >= 2) selectMention('here')
          else if (filtered[menuIndex - offset]) selectMention(filtered[menuIndex - offset])
        } else {
          const q = menu.query.toLowerCase()
          const match = channels.find(
            (c) => c.kind !== 'dm' && c.kind !== 'group_dm' && (c.slug.includes(q) || c.name.toLowerCase().includes(q)),
          )
          if (match) selectChannel(match.slug)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(null)
        return
      }
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      // Cmd/Ctrl+Enter always sends
      event.preventDefault()
      void submit()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
      return
    }
    if (event.key === 'Escape' && editingMessage) {
      event.preventDefault()
      setEditingMessageId(null)
      setText(drafts[draftKey] ?? '')
      return
    }
    if (event.key === 'ArrowUp' && !text && !editingMessage && !parentId) {
      // edit my own last message in this channel
      const mine = [...messages].reverse().find((m) => m.sender?.id === me?.id && !m.deletedAt)
      if (mine) {
        event.preventDefault()
        setEditingMessageId(mine.id)
      }
    }
  }

  if (!channel || channel.isArchived) {
    return (
      <div className="shrink-0 px-4 pb-4 md:px-6">
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
          This channel is archived — history is read-only.
        </div>
      </div>
    )
  }

  const displayPlaceholder =
    placeholder ??
    (channel.kind === 'dm' || channel.kind === 'group_dm'
      ? channel.members?.length === 1
        ? `Message ${channel.members[0].name}${channel.members[0].kind === 'agent' ? ' — try asking anything' : ''}`
        : 'Message group'
      : `Message #${channel.name}`)

  const toolbarButton =
    'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground'

  return (
    <div className="relative shrink-0 px-4 pb-4 md:px-6">
      {!parentId && channelId && <TypingIndicator channelId={channelId} />}

      {/* edit bar */}
      {editingMessage && (
        <div className="mb-1.5 flex items-center gap-2 rounded-t-xl border border-b-0 border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span className="flex-1">
            Editing message
            <span className="ml-1.5 font-normal text-amber-600/70 dark:text-amber-400/70">Esc to cancel</span>
          </span>
          <button
            type="button"
            aria-label="Cancel edit"
            onClick={() => {
              setEditingMessageId(null)
              setText(drafts[draftKey] ?? '')
            }}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-amber-500/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Save edit"
            onClick={() => void submit()}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-amber-500/20"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div
        className={cn(
          'relative rounded-xl border bg-card shadow-sm transition-all duration-150',
          'focus-within:border-emerald-500/50 focus-within:shadow-lg focus-within:shadow-emerald-500/10',
          editingMessage ? 'rounded-t-none border-amber-500/40' : 'border-border',
          dragging && 'border-emerald-500 ring-2 ring-emerald-500/30',
        )}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length > 0) void uploadFiles(event.dataTransfer.files)
        }}
      >
        {/* drop overlay */}
        {dragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-500/10 backdrop-blur-sm">
            <FileUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Drop to upload</p>
          </div>
        )}

        {/* mention/channel/slash menus */}
        {menu && menu.kind === 'mention' && (
          <MentionMenu
            users={mentionFiltered}
            query={menu.query}
            activeIndex={menuIndex}
            onSelect={selectMention}
            onClose={() => setMenu(null)}
          />
        )}
        {menu && menu.kind === 'slash' && (
          <SlashMenu
            commands={slashFiltered}
            activeIndex={Math.min(menuIndex, Math.max(0, slashFiltered.length - 1))}
            onSelect={selectCommand}
            onClose={() => setMenu(null)}
          />
        )}
        {menu && menu.kind === 'channel' && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            <p className="border-b border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Channels
            </p>
            <div className="max-h-60 overflow-y-auto p-1">
              {channelFiltered.map((channel2, index) => (
                <button
                  key={channel2.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150',
                    menuIndex === index ? 'bg-accent' : 'hover:bg-accent',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectChannel(channel2.slug)}
                >
                  <span className="text-muted-foreground">#</span>
                  <span className="truncate">{channel2.slug}</span>
                </button>
              ))}
              {channelFiltered.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">No channels match</p>
              )}
            </div>
          </div>
        )}

        {/* file chips */}
        {(files.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-2 border-b border-border px-3 pb-2.5 pt-3">
            {files.map((file) => (
              <span
                key={file.id}
                className="group/file relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs"
              >
                <span className="max-w-40 truncate font-medium">{file.name}</span>
                <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                {file.mimeType.startsWith('image/') && (
                  <img src={file.url} alt="" className="h-8 w-8 rounded object-cover" />
                )}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40"
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Uploading…
              </span>
            )}
          </div>
        )}

        <label htmlFor={parentId ? `composer-${parentId}` : 'composer-main'} className="sr-only">
          {editingMessage ? 'Edit message' : displayPlaceholder}
        </label>
        <textarea
          id={parentId ? `composer-${parentId}` : 'composer-main'}
          ref={textareaRef}
          value={text}
          rows={1}
          placeholder={displayPlaceholder}
          aria-label={displayPlaceholder}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'))
            if (images.length > 0) {
              event.preventDefault()
              void uploadFiles(images)
              toast.success('Image attached')
            }
          }}
          className="max-h-40 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[15px] leading-relaxed outline-none transition-colors duration-200 placeholder:text-muted-foreground/70 focus:placeholder:text-muted-foreground/40"
        />

        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <button type="button" aria-label="Bold" title="Bold" className={toolbarButton} onClick={() => wrapSelection('**')}>
            <Bold className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Italic" title="Italic" className={toolbarButton} onClick={() => wrapSelection('*')}>
            <Italic className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Strikethrough"
            title="Strikethrough"
            className={toolbarButton}
            onClick={() => wrapSelection('~~')}
          >
            <Strikethrough className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Link"
            title="Link"
            className={toolbarButton}
            onClick={() => wrapSelection('[', '](https://)', 'link text')}
          >
            <LinkIcon className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Inline code"
            title="Inline code"
            className={toolbarButton}
            onClick={() => wrapSelection('`', '`', 'code')}
          >
            <Code className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Code block"
            title="Code block"
            className={toolbarButton}
            onClick={() => wrapSelection('\n```\n', '\n```\n', 'code block')}
          >
            <TextQuote className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Quote"
            title="Quote"
            className={toolbarButton}
            onClick={() => insertAtCaret('> ')}
          >
            <Quote className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Bulleted list"
            title="Bulleted list"
            className={toolbarButton}
            onClick={() => insertAtCaret('- ')}
          >
            <List className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Numbered list"
            title="Numbered list"
            className={toolbarButton}
            onClick={() => insertAtCaret('1. ')}
          >
            <ListOrdered className="h-4 w-4" aria-hidden />
          </button>

          <span className="mx-1 h-4 w-px bg-border" aria-hidden />

          <button
            type="button"
            aria-label="Slash commands"
            title="Slash commands"
            className={cn(
              toolbarButton,
              menu?.kind === 'slash' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
            )}
            onClick={() => {
              const el = textareaRef.current
              el?.focus()
              if (!text.startsWith('/')) insertAtCaret('/')
            }}
          >
            <Slash className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Attach file"
            title="Attach file"
            className={toolbarButton}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" aria-hidden />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              if (event.target.files?.length) void uploadFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Add emoji" title="Emoji" className={toolbarButton}>
                <Smile className="h-4 w-4" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-xl p-0">
              <EmojiPicker onSelect={(char) => insertAtCaret(char)} />
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-2 pr-1">
            {isAgentDm && (
              <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <Sparkles className="h-3 w-3 text-amber-500" aria-hidden /> AI teammate
              </span>
            )}
            <button
              type="button"
              aria-label={editingMessage ? 'Save changes' : 'Send message'}
              onClick={() => void submit()}
              disabled={(!text.trim() && files.length === 0) || uploading > 0}
              className="flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {editingMessage ? 'Save' : 'Send'}
            </button>
          </div>
        </div>
      </div>
      {(focused || menu?.kind === 'slash') && (
        <p className="mt-1.5 animate-in fade-in slide-in-from-bottom-1 px-1 text-[11px] text-muted-foreground/70 duration-150">
          <Slash className="mr-1 inline h-3 w-3 align-[-1px] text-emerald-600/80 dark:text-emerald-400/80" aria-hidden />
          Type <span className="font-mono font-semibold">/</span> for commands —{' '}
          <span className="font-mono">/me</span>, <span className="font-mono">/shrug</span>,{' '}
          <span className="font-mono">/tableflip</span>, <span className="font-mono">/unflip</span>,{' '}
          <span className="font-mono">/topic</span>
        </p>
      )}
      <p className="mt-1.5 hidden px-1 text-[11px] text-muted-foreground/70 sm:block">
        <kbd className="rounded border border-border bg-muted px-1 font-mono">Enter</kbd> to send ·{' '}
        <kbd className="rounded border border-border bg-muted px-1 font-mono">Shift+Enter</kbd> new line ·{' '}
        <kbd className="rounded border border-border bg-muted px-1 font-mono">↑</kbd> edit last ·{' '}
        <kbd className="rounded border border-border bg-muted px-1 font-mono">@</kbd> mention ·{' '}
        <kbd className="rounded border border-border bg-muted px-1 font-mono">/</kbd> commands
      </p>
    </div>
  )
}
