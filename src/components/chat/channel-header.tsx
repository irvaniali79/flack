'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Archive,
  Bell,
  BellOff,
  Check,
  Hash,
  Loader2,
  Lock,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  Search,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getActiveChannel, useChatStore } from '@/lib/store'
import type { UserDTO } from '@/lib/types'
import { UserAvatar } from './avatar'
import { PresenceDot } from './presence-dot'
import { SummaryTrigger } from './agents/summary-dialog'
import { AppBadge } from './connectors/connector-icon'
import { formatRelativeTime } from '@/lib/time'

// ─── members popover ─────────────────────────────────────────────────────────

function MembersPopover() {
  const channel = useChatStore(getActiveChannel)
  const me = useChatStore((s) => s.me)
  const users = useChatStore((s) => s.users)
  const presence = useChatStore((s) => s.presence)
  const createDm = useChatStore((s) => s.createDm)
  const addChannelMember = useChatStore((s) => s.addChannelMember)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)
  const [members, setMembers] = useState<UserDTO[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const channelId = channel?.id ?? null

  // This component is keyed by channel id at its usage site, so a channel
  // switch remounts it with fresh state — no synchronous reset needed here.
  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    fetch(`/api/channels/${channelId}`)
      .then((res) => res.json())
      .then((data: { members?: UserDTO[] }) => {
        if (!cancelled) setMembers(data.members ?? [])
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
    return () => {
      cancelled = true
    }
  }, [channelId])

  if (!channel || channel.kind === 'dm' || channel.kind === 'group_dm') return null

  const memberIds = new Set((members ?? []).map((m) => m.id))
  const addable = users.filter(
    (u) => !memberIds.has(u.id) && u.id !== me?.id && u.kind === 'human',
  )
  const filtered = addable.filter(
    (u) =>
      !pickerQuery ||
      u.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
      (u.title ?? '').toLowerCase().includes(pickerQuery.toLowerCase()),
  )

  return (
    <PopoverContent align="start" className="w-72 rounded-xl p-0">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-sm font-semibold">
          Members
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {members ? members.length : '…'}
          </span>
        </p>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {!members ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : adding ? (
          <div>
            <div className="p-1.5">
              <Input
                autoFocus
                placeholder="Search people…"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                className="h-8 rounded-lg text-sm"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Everyone is already here</p>
            ) : (
              filtered.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    void addChannelMember(channel.id, user.id).then(() => {
                      setMembers((prev) => (prev ? [...prev, user] : prev))
                      toast.success(`Added ${user.name}`)
                    })
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent"
                >
                  <UserAvatar user={user} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{user.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {user.title ?? (user.kind === 'agent' ? 'AI agent' : '')}
                    </span>
                  </span>
                  <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                </button>
              ))
            )}
          </div>
        ) : (
          members.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setProfileUserId(user.id)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent"
            >
              <UserAvatar
                user={user}
                size="xs"
                presence={user.kind !== 'app'}
                online={presence[user.id] || user.kind === 'agent'}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm">{user.name}</span>
                  {user.kind === 'app' && <AppBadge />}
                  {user.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{user.title}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Message ${user.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (user.id !== me?.id) void createDm([user.id])
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation()
                    if (user.id !== me?.id) void createDm([user.id])
                  }
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-background group-hover:opacity-100"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
          ))
        )}
      </div>
      {!adding && (
        <div className="border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 rounded-lg text-sm text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="h-4 w-4" aria-hidden /> Add people
          </Button>
        </div>
      )}
    </PopoverContent>
  )
}

// ─── pinned messages popover ─────────────────────────────────────────────────

function PinnedPopover() {
  const channel = useChatStore(getActiveChannel)
  const messages = useChatStore((s) => (channel ? s.messagesByChannel[channel.id] : undefined)) ?? []
  const openThread = useChatStore((s) => s.openThread)
  const pinned = messages.filter((m) => m.isPinned && !m.deletedAt)

  return (
    <PopoverContent align="end" className="w-80 rounded-xl p-0">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-sm font-semibold">
          Pinned messages <span className="ml-1 text-xs font-normal text-muted-foreground">{pinned.length}</span>
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5">
        {pinned.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Pin className="h-7 w-7 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">Nothing pinned yet</p>
            <p className="text-xs text-muted-foreground/70">
              Pin important messages from their ⋯ menu.
            </p>
          </div>
        ) : (
          pinned.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => {
                if (message.replyCount > 0) void openThread(message.id)
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent"
            >
              <span className="flex items-center gap-1.5">
                <UserAvatar user={message.sender ?? { name: '?', avatarColor: '#71717a', kind: 'human' }} size="xs" />
                <span className="text-xs font-semibold">{message.sender?.name ?? 'Unknown'}</span>
                <span className="text-[10px] text-muted-foreground">{formatRelativeTime(message.createdAt)}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-[13px] text-foreground/80">{message.body}</span>
            </button>
          ))
        )}
      </div>
    </PopoverContent>
  )
}

// ─── header ──────────────────────────────────────────────────────────────────

interface HeaderEditState {
  channelId: string
  topic: string | null // null = not editing the topic
  renaming: boolean
  renameValue: string
}

export function ChannelHeader() {
  const channel = useChatStore(getActiveChannel)
  const me = useChatStore((s) => s.me)
  const users = useChatStore((s) => s.users)
  const presence = useChatStore((s) => s.presence)
  const connected = useChatStore((s) => s.connected)
  const activeThreadRootId = useChatStore((s) => s.activeThreadRootId)
  const closeThread = useChatStore((s) => s.closeThread)
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const updateChannel = useChatStore((s) => s.updateChannel)
  const setNotifyPrefs = useChatStore((s) => s.setNotifyPrefs)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const createDm = useChatStore((s) => s.createDm)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)

  const [editState, setEditState] = useState<HeaderEditState | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Derive the in-progress edits for the CURRENT channel — stale edits from
  // another channel are discarded automatically, without a reset effect.
  const edit = editState && channel && editState.channelId === channel.id ? editState : null
  const topicEdit = edit ? edit.topic : null
  const renaming = !!edit?.renaming
  const renameValue = edit?.renameValue ?? ''

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [renaming])

  if (!channel) {
    return (
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open sidebar"
          className="h-9 w-9"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
        <span className="ml-2 font-semibold">Acme Chat</span>
      </header>
    )
  }

  const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'
  const others = isDm ? (channel.members ?? []) : []
  const onlineCount = others.filter((u) => presence[u.id]).length
  const dmOther = others.length === 1 ? others[0] : null
  const dmTitle = isDm
    ? others.length === 1
      ? others[0].name
      : others.map((u) => u.name.split(' ')[0]).join(', ') || channel.name
    : channel.name
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const iconButton =
    'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground'

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open sidebar"
        className="h-9 w-9 shrink-0 md:hidden"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      {isDm ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex -space-x-2">
            {others.slice(0, 3).map((user) => (
              <button
                key={user.id}
                type="button"
                aria-label={`View ${user.name}'s profile`}
                title={`View ${user.name}'s profile`}
                onClick={() => setProfileUserId(user.id)}
                className="rounded-full transition-transform duration-150 hover:scale-110 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <UserAvatar user={user} size="sm" className="ring-2 ring-background" />
              </button>
            ))}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {dmOther ? (
                <button
                  type="button"
                  aria-label={`View ${dmOther.name}'s profile`}
                  title={`View ${dmOther.name}'s profile`}
                  onClick={() => setProfileUserId(dmOther.id)}
                  className="truncate rounded-md px-0.5 text-left text-[15px] font-bold leading-tight hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                >
                  {dmTitle}
                </button>
              ) : (
                <h1 className="truncate text-[15px] font-bold leading-tight">{dmTitle}</h1>
              )}
              {dmOther?.kind === 'agent' && (
                <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  AI
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {dmOther && <PresenceDot online={presence[dmOther.id] || dmOther.kind === 'agent'} className="h-2 w-2" />}
              <span className="truncate">
                {dmOther
                  ? presence[dmOther.id] || dmOther.kind === 'agent'
                    ? dmOther.statusText || 'Active now'
                    : 'Offline'
                  : `${channel.memberCount} members`}
                {others.length > 1 && onlineCount > 0 && ` · ${onlineCount + 1} online`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <Input
                ref={renameRef}
                value={renameValue}
                onChange={(event) =>
                  setEditState((prev) => (prev ? { ...prev, renameValue: event.target.value } : prev))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && renameValue.trim()) {
                    void updateChannel(channel.id, { name: renameValue.trim() })
                      .then(() => toast.success('Channel renamed'))
                      .catch((err: Error) => toast.error(err.message))
                    setEditState((prev) => (prev ? { ...prev, renaming: false } : prev))
                  }
                  if (event.key === 'Escape') setEditState((prev) => (prev ? { ...prev, renaming: false } : prev))
                }}
                className="h-8 w-48 rounded-lg text-sm font-semibold"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel rename"
                className="h-7 w-7"
                onClick={() => setEditState((prev) => (prev ? { ...prev, renaming: false } : prev))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ) : (
            <>
              {channel.kind === 'private' ? (
                <Lock className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Hash className="h-[22px] w-[22px] shrink-0 text-muted-foreground" aria-hidden />
              )}
              <h1
                className={cn(
                  'truncate text-[15px] font-bold leading-tight',
                  channel.isArchived && 'text-muted-foreground line-through decoration-muted-foreground/50',
                )}
              >
                {channel.name}
              </h1>
            </>
          )}

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

          {/* topic */}
          <div className="hidden min-w-0 sm:block">
            {topicEdit === null ? (
              <button
                type="button"
                title={channel.topic ?? 'Add a topic'}
                onClick={() => channel.isMember && setEditState({ channelId: channel.id, topic: channel.topic ?? '', renaming: false, renameValue: '' })}
                className={cn(
                  'max-w-[240px] truncate rounded px-1.5 py-0.5 text-[13px] text-muted-foreground transition-colors duration-150 lg:max-w-[420px] xl:max-w-[520px]',
                  channel.isMember &&
                    'hover:bg-accent hover:text-foreground hover:decoration-muted-foreground/50 hover:underline hover:underline-offset-4',
                )}
              >
                {channel.topic || (channel.isMember ? 'Add a topic' : '')}
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void updateChannel(channel.id, { topic: topicEdit.trim() || null })
                    .then(() => toast.success('Topic updated'))
                    .catch((err: Error) => toast.error(err.message))
                  setEditState(null)
                }}
                className="flex items-center gap-1"
              >
                <Input
                  autoFocus
                  value={topicEdit}
                  onChange={(event) =>
                    setEditState((prev) => (prev ? { ...prev, topic: event.target.value } : prev))
                  }
                  placeholder="Set a topic…"
                  className="h-7 w-56 rounded-lg text-[13px]"
                />
                <Button type="submit" variant="ghost" size="icon" aria-label="Save topic" className="h-7 w-7">
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {/* AI catch-me-up */}
        <SummaryTrigger
          channelId={channel.id}
          title={isDm ? `Catch me up — ${dmTitle}` : `Catch me up on #${channel.name}`}
        />

        {/* member count */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="View members"
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Users className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{channel.memberCount}</span>
            </button>
          </PopoverTrigger>
          <MembersPopover key={channel.id} />
        </Popover>

        {/* pinned */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Pinned messages"
              className={iconButton}
            >
              <Pin className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PinnedPopover />
        </Popover>

        {/* search in channel */}
        <button
          type="button"
          aria-label="Search in this channel"
          className={iconButton}
          onClick={() =>
            setSearchOpen(true, isDm ? `from:${dmTitle.split(' ')[0]}` : `in:#${channel.name}`)
          }
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>

        {/* notification prefs */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Notification preferences"
              className={cn(iconButton, channel.muted && 'text-rose-500 dark:text-rose-400')}
            >
              {channel.muted ? <BellOff className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Get notified for</DropdownMenuLabel>
            {(['all', 'mentions', 'none'] as const).map((level) => (
              <DropdownMenuItem
                key={level}
                className="gap-2 capitalize"
                onClick={() => {
                  void setNotifyPrefs(channel.id, { notifyLevel: level })
                  toast.success(`Notifications: ${level === 'all' ? 'All new messages' : level === 'mentions' ? 'Mentions only' : 'Nothing'}`)
                }}
              >
                {channel.notifyLevel === level ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <span className="w-4" aria-hidden />
                )}
                {level === 'all' ? 'All new messages' : level === 'mentions' ? 'Mentions only' : 'Nothing'}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                void setNotifyPrefs(channel.id, { muted: !channel.muted })
                toast.success(channel.muted ? 'Channel unmuted' : 'Channel muted')
              }}
            >
              {channel.muted ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
              {channel.muted ? 'Unmute channel' : 'Mute channel'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* admin channel menu (channels only) */}
        {!isDm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Channel options" className={iconButton}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              {isAdmin && (
                <>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => {
                      setEditState({
                        channelId: channel.id,
                        topic: topicEdit,
                        renaming: true,
                        renameValue: channel.name,
                      })
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Rename channel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => {
                      void updateChannel(channel.id, { isArchived: !channel.isArchived })
                        .then(() => toast.success(channel.isArchived ? 'Channel unarchived' : 'Channel archived'))
                        .catch((err: Error) => toast.error(err.message))
                    }}
                  >
                    <Archive className="h-4 w-4" aria-hidden />
                    {channel.isArchived ? 'Unarchive channel' : 'Archive channel'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="gap-2 text-rose-600 focus:text-rose-600 dark:focus:text-rose-400"
                onClick={() => {
                  void leaveChannel(channel.id).then(() => toast.success(`Left #${channel.name}`))
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Leave channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {activeThreadRootId && (
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-1.5 rounded-lg border-border px-2.5 text-xs lg:flex"
            onClick={closeThread}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Close thread
          </Button>
        )}
      </div>

      {/* reconnecting banner */}
      {!connected && (
        <div className="absolute inset-x-0 -bottom-8 z-30 flex justify-center">
          <div className="flex items-center gap-2 rounded-b-lg border border-t-0 border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm dark:text-amber-300">
            <WifiOff className="h-3 w-3" aria-hidden /> Reconnecting…
          </div>
        </div>
      )}
    </header>
  )
}
