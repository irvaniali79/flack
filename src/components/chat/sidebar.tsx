'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Bell,
  BellOff,
  Blocks,
  Bookmark,
  Bot,
  CheckCheck,
  ChevronDown,
  CircleDot,
  Clock,
  Compass,
  DoorOpen,
  Hash,
  Keyboard,
  Link2,
  Lock,
  LogOut,
  MessagesSquare,
  Moon,
  MoonStar,
  PenLine,
  Plug,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  SquarePen,
  Sun,
  UserRound,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useViewStore, type MainView } from '@/lib/view-store'
import type { AgentDTO, ChannelDTO } from '@/lib/types'
import { UserAvatar } from './avatar'
import { PresenceDot } from './presence-dot'
import { AgentDialog } from './agents/agent-dialog'
import { formatRelativeTime, formatTime } from '@/lib/time'
import type { NotificationDTO } from '@/lib/types'
import { isQuietHours, quietUntilLabel } from '@/lib/dnd'
import { AtSign, CornerDownRight } from 'lucide-react'
import { RenameChannelDialog } from './dialogs/rename-channel'

// ─── notification bell ───────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { icon: typeof AtSign; classes: string; label: string }> = {
  mention: {
    icon: AtSign,
    classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    label: 'Mention',
  },
  mention_special: {
    icon: AtSign,
    classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    label: 'Channel mention',
  },
  thread_reply: {
    icon: CornerDownRight,
    classes: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    label: 'Thread reply',
  },
  workflow: {
    icon: Sparkles,
    classes: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
    label: 'Workflow',
  },
}

const FALLBACK_STYLE = { classes: 'bg-muted text-muted-foreground', label: 'Notification' }

// ── notification snooze ─────────────────────────────────────────────────────

function tomorrow9amIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

const SNOOZE_PRESETS: { label: string; minutes?: number; until?: string }[] = [
  { label: '20 minutes', minutes: 20 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: 'Tomorrow 9 AM', until: tomorrow9amIso() },
]

function SnoozeMenu({ onSnooze }: { onSnooze: (preset: { minutes?: number; until?: string }) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Snooze notification"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-44 rounded-xl p-1">
        <p className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Snooze for
        </p>
        {SNOOZE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              onSnooze(preset.minutes !== undefined ? { minutes: preset.minutes } : { until: preset.until })
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-accent"
          >
            <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />
            {preset.label}
          </button>
        ))}
        <p className="px-2 pb-1.5 pt-1 text-[10px] leading-snug text-muted-foreground">
          Hidden from your badge until then — returns as unread.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function NotificationBell() {
  const notifications = useChatStore((s) => s.notifications)
  const unread = useChatStore((s) => s.notificationsUnread)
  const fetchNotifications = useChatStore((s) => s.fetchNotifications)
  const markNotificationsRead = useChatStore((s) => s.markNotificationsRead)
  const snoozeNotification = useChatStore((s) => s.snoozeNotification)
  const unsnoozeNotification = useChatStore((s) => s.unsnoozeNotification)
  const openChannel = useChatStore((s) => s.openChannel)
  const me = useChatStore((s) => s.me)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) void fetchNotifications()
  }, [open, fetchNotifications])

  const quiet = me ? isQuietHours(me) : false
  const quietUntil = me ? quietUntilLabel(me) : null
  // Suppressed (quiet-hours) rows render in their own section, not as unread;
  // snoozed rows hide until their timer ends
  const now = Date.now()
  const isSnoozed = (n: NotificationDTO) =>
    n.snoozedUntil ? new Date(n.snoozedUntil).getTime() > now : false
  const active = notifications.filter((n) => !n.suppressed && !isSnoozed(n))
  const quietRows = notifications.filter((n) => n.suppressed && !isSnoozed(n))
  const snoozedRows = notifications.filter(isSnoozed)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ''}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 rounded-xl p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Snooze all unread notifications for 1 hour"
                title="Snooze all unread for 1 hour"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  void api('/api/notifications/snooze', { method: 'POST', body: { all: true, minutes: 60 } })
                    .then(() => toast.success('Unread notifications snoozed for 1 hour'))
                    .catch(() => toast.error('Could not snooze notifications'))
                    .finally(() => void fetchNotifications())
                }}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden /> Snooze all
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => void markNotificationsRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
            </Button>
          </div>
        </div>
        {quiet && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <MoonStar className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-[11px] font-medium leading-snug text-amber-800 dark:text-amber-200">
              Quiet hours{quietUntil ? ` — notifications arrive silently until ${quietUntil}` : ' — notifications arrive silently'}
            </p>
          </div>
        )}
        <div className="max-h-96 overflow-y-auto p-1.5">
          {active.length === 0 && quietRows.length === 0 && snoozedRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">You&rsquo;re all caught up</p>
            </div>
          ) : (
            <>
              {active.map((notification) => {
                const style = TYPE_STYLES[notification.type] ?? FALLBACK_STYLE
                const Icon = style.icon ?? Bell
                return (
                <div
                  key={notification.id}
                  className={cn(
                    'group flex items-start gap-1 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-accent',
                    !notification.readAt && 'bg-emerald-500/5',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (notification.channelId) {
                        void openChannel(notification.channelId)
                      }
                      // Reading it = read (single-row mark)
                      if (!notification.readAt) {
                        void markNotificationsRead([notification.id])
                      }
                      setOpen(false)
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        style.classes,
                      )}
                      aria-hidden
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug">{notification.body}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium">{style.label}</span>
                        <span aria-hidden>·</span>
                        <span>{formatRelativeTime(notification.createdAt)}</span>
                        {notification.channelName ? <span aria-hidden>· {notification.channelName}</span> : null}
                      </span>
                    </span>
                    {!notification.readAt && (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                  <SnoozeMenu onSnooze={(preset) => void snoozeNotification(notification.id, preset)} />
                </div>
                )
              })}
              {quietRows.length > 0 && (
                <div className="mt-1">
                  <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <MoonStar className="h-3 w-3" aria-hidden /> Delivered quietly
                  </p>
                  {quietRows.map((notification) => {
                    const style = TYPE_STYLES[notification.type] ?? FALLBACK_STYLE
                    const Icon = style.icon ?? Bell
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          if (notification.channelId) {
                            void openChannel(notification.channelId)
                          }
                          void markNotificationsRead([notification.id])
                          setOpen(false)
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left opacity-70 transition-all duration-150 hover:bg-accent hover:opacity-100"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60',
                            style.classes,
                          )}
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] leading-snug">{notification.body}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="font-medium">{style.label}</span>
                            <span aria-hidden>·</span>
                            <span>{formatRelativeTime(notification.createdAt)}</span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  <p className="px-2.5 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Held back by quiet hours — delivered with a digest when your window ends.
                  </p>
                </div>
              )}

              {snoozedRows.length > 0 && (
                <div className="mt-1">
                  <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    <Clock className="h-3 w-3" aria-hidden /> Snoozed
                  </p>
                  {snoozedRows.map((notification) => {
                    const style = TYPE_STYLES[notification.type] ?? FALLBACK_STYLE
                    const Icon = style.icon ?? Bell
                    return (
                      <div
                        key={notification.id}
                        className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 opacity-60"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60',
                            style.classes,
                          )}
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-[13px] leading-snug">{notification.body}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400">
                              <Clock className="h-3 w-3" aria-hidden /> until{' '}
                              {formatTime(notification.snoozedUntil!)}
                            </span>
                            <span aria-hidden>·</span>
                            <button
                              type="button"
                              onClick={() => void unsnoozeNotification(notification.id)}
                              className="rounded px-1 font-medium text-foreground/80 underline-offset-2 opacity-0 transition-opacity duration-150 hover:text-foreground hover:underline focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              Bring back now
                            </button>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <p className="px-2.5 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Snoozed notifications return as unread when their timer ends.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── channel row ─────────────────────────────────────────────────────────────

function UnreadBadge({ count, mentions, muted = false }: { count: number; mentions: number; muted?: boolean }) {
  if (count <= 0) return null
  if (mentions > 0 && !muted) {
    return (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
        {mentions > 9 ? '9+' : mentions}
      </span>
    )
  }
  // muted channels render a hollow badge (Slack behaviour — still countable,
  // but visually de-emphasised)
  if (muted) {
    return (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-transparent px-1.5 text-[11px] font-bold text-muted-foreground">
        {mentions > 0 ? (mentions > 9 ? '9+' : mentions) : count > 99 ? '99+' : count}
      </span>
    )
  }
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-bold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── channel row with Slack-style right-click menu ──────────────────────────

function ChannelRow({ channel, onRename }: { channel: ChannelDTO; onRename?: (c: ChannelDTO) => void }) {
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const openChannel = useChatStore((s) => s.openChannel)
  const presence = useChatStore((s) => s.presence)
  const me = useChatStore((s) => s.me)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)
  const setNotifyPrefs = useChatStore((s) => s.setNotifyPrefs)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const markChannelUnread = useChatStore((s) => s.markChannelUnread)
  const markChannelAllRead = useChatStore((s) => s.markChannelAllRead)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const active = activeChannelId === channel.id
  const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'

  const other = isDm && channel.members?.length ? channel.members[0] : null
  const online = other ? presence[other.id] : false
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const label = isDm
    ? channel.kind === 'dm'
      ? (other?.name ?? channel.name)
      : `${(channel.members ?? []).map((m) => m.name.split(' ')[0]).join(', ')}`
    : channel.name

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?channel=${channel.id}`)
      toast.success(isDm ? 'Conversation link copied' : `Link to #${channel.name} copied`)
    } catch {
      toast.error('Copy failed')
    }
  }

  const toggleMute = () => {
    const next = !channel.muted
    void setNotifyPrefs(channel.id, { muted: next })
    toast.success(next ? `Muted ${isDm ? label : `#${channel.name}`}` : 'Notifications back on', {
      description: next ? 'You won\u2019t be notified about new messages' : undefined,
    })
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            id={`sidebar-item-${channel.id}`}
            onClick={() => void openChannel(channel.id)}
            className={cn(
              'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 hover:translate-x-0.5',
              active
                ? 'bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'text-foreground/75 hover:bg-accent-surface-hover hover:text-foreground',
              channel.unread > 0 && !active && 'font-medium text-foreground',
            )}
          >
            {/* active left bar */}
            <span
              className={cn(
                'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500 transition-opacity duration-150',
                active ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden
            />
            {isDm ? (
              other ? (
                <span className="relative shrink-0">
                  <UserAvatar user={other} size="xs" />
                  {other.kind === 'human' && <PresenceDot online={online} className="absolute -bottom-1 -right-1 h-2.5 w-2.5" />}
                </span>
              ) : (
                <span className="w-6" aria-hidden />
              )
            ) : channel.kind === 'private' ? (
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            {other?.kind === 'agent' && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
              </span>
            )}
            {channel.isArchived && (
              <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
                arch
              </span>
            )}
            {channel.muted && !channel.isArchived && other?.kind !== 'agent' && (
              <VolumeX className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Muted" />
            )}
            <UnreadBadge count={channel.unread} mentions={channel.mentionCount} muted={channel.muted} />
          </button>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56 rounded-xl">
          {/* DM: open the teammate's profile */}
          {isDm && other && (
            <ContextMenuItem className="gap-2" onClick={() => setProfileUserId(other.id)}>
              <UserRound className="h-4 w-4" aria-hidden /> View profile
            </ContextMenuItem>
          )}
          {channel.unread > 0 ? (
            <ContextMenuItem className="gap-2" onClick={() => void markChannelAllRead(channel.id)}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Mark as read
            </ContextMenuItem>
          ) : (
            <ContextMenuItem className="gap-2" onClick={() => void markChannelUnread(channel.id)}>
              <CircleDot className="h-4 w-4" aria-hidden /> Mark as unread
            </ContextMenuItem>
          )}
          <ContextMenuItem className="gap-2" onClick={toggleMute}>
            {channel.muted ? (
              <>
                <Volume2 className="h-4 w-4" aria-hidden /> Unmute {isDm ? 'conversation' : 'channel'}
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4" aria-hidden /> Mute {isDm ? 'conversation' : 'channel'}
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem className="gap-2" onClick={() => void copyLink()}>
            <Link2 className="h-4 w-4" aria-hidden /> Copy link
          </ContextMenuItem>
          {/* channels only: rename (admins) + leave */}
          {!isDm && onRename && isAdmin && !channel.isArchived && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem className="gap-2" onClick={() => onRename(channel)}>
                <SquarePen className="h-4 w-4" aria-hidden /> Rename channel
              </ContextMenuItem>
            </>
          )}
          {!isDm && !channel.isDefault && (
            <>
              {!(onRename && isAdmin && !channel.isArchived) && <ContextMenuSeparator />}
              <ContextMenuItem
                className="gap-2 text-rose-600 focus:text-rose-600 dark:focus:text-rose-400"
                onClick={() => setConfirmLeave(true)}
              >
                <DoorOpen className="h-4 w-4" aria-hidden /> Leave channel
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* leave confirmation */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave #{channel.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't receive updates from #{channel.name} anymore. You can always rejoin later
              from Browse channels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => {
                setConfirmLeave(false)
                void leaveChannel(channel.id).then(
                  () => toast.success(`Left #${channel.name}`),
                  (err: Error) => toast.error(err.message),
                )
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── agent launcher row (unified DM list — agents with no open conversation) ─

function AgentLauncherRow({ agent, onStart }: { agent: AgentDTO; onStart: (userId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onStart(agent.userId)}
      title={`Start a chat with ${agent.user.name} (@${agent.handle})${agent.description ? ` — ${agent.description}` : ''}`}
      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-foreground/65 transition-all duration-150 hover:translate-x-0.5 hover:bg-accent-surface-hover hover:text-foreground"
    >
      <span className="shrink-0">
        <UserAvatar user={agent.user} size="xs" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{agent.user.name}</span>
      <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 opacity-80 transition-opacity duration-150 group-hover:opacity-100 dark:text-amber-400">
        <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
      </span>
    </button>
  )
}

// ─── workspace rows (mobile drawer only) ─────────────────────────────────────

function WorkspaceRow({
  icon: Icon,
  label,
  title,
  target,
}: {
  icon: LucideIcon
  label: string
  title?: string
  target: MainView
}) {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const active = view === target

  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={title ?? label}
      onClick={() => {
        setView(target)
        // close the mobile drawer without routing back to chat
        useChatStore.getState().setDrawerOpen(false)
      }}
      className={cn(
        'group relative flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 hover:translate-x-0.5',
        active
          ? 'bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'text-foreground/75 hover:bg-accent-surface-hover hover:text-foreground',
      )}
    >
      {/* active left bar */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500 transition-opacity duration-150',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <Icon
        className={cn('h-4 w-4 shrink-0', !active && 'text-muted-foreground')}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
    </button>
  )
}

// ─── main sidebar ────────────────────────────────────────────────────────────

export function Sidebar({
  onNavigate,
  showWorkspaceNav = false,
}: {
  onNavigate?: () => void
  showWorkspaceNav?: boolean
}) {
  const me = useChatStore((s) => s.me)
  const orgName = useChatStore((s) => s.orgName)
  const channels = useChatStore((s) => s.channels)
  const users = useChatStore((s) => s.users)
  const agents = useChatStore((s) => s.agents)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const savedCount = useChatStore((s) => s.savedMessageIds.length)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const setCreateChannelOpen = useChatStore((s) => s.setCreateChannelOpen)
  const setBrowseChannelsOpen = useChatStore((s) => s.setBrowseChannelsOpen)
  const setNewDmOpen = useChatStore((s) => s.setNewDmOpen)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)
  const setShortcutsOpen = useChatStore((s) => s.setShortcutsOpen)
  const logout = useChatStore((s) => s.logout)
  const openChannel = useChatStore((s) => s.openChannel)
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const { resolvedTheme, setTheme } = useTheme()

  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)
  const [agentsDialogOpen, setAgentsDialogOpen] = useState(false)
  const [renameChannel, setRenameChannel] = useState<ChannelDTO | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const memberChannels = useMemo(
    () => channels.filter((c) => c.kind !== 'dm' && c.kind !== 'group_dm' && c.isMember),
    [channels],
  )
  const dmChannels = useMemo(
    () => channels.filter((c) => c.kind === 'dm' || c.kind === 'group_dm'),
    [channels],
  )
  // agents without an open conversation appear as launchers inside the unified DM list
  const agentLaunchers = useMemo(
    () =>
      agents.filter(
        (a) =>
          a.isActive &&
          !dmChannels.some((c) => c.kind === 'dm' && c.members?.some((m) => m.id === a.userId)),
      ),
    [agents, dmChannels],
  )

  // auto-scroll the active channel into view
  useEffect(() => {
    if (!activeChannelId) return
    document
      .getElementById(`sidebar-item-${activeChannelId}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeChannelId])

  const openAgentDm = async (userId: string) => {
    await useChatStore.getState().createDm([userId])
    onNavigate?.()
  }

  return (
    // `dark` class — the whole sidebar chrome renders the saturated dark token
    // set in BOTH light & dark mode (user-requested: identical sidebar colors
    // across modes; text/badges/variants resolve from the scoped .dark rules).
    // `text-foreground` — explicit color so descendants that plain-INHERIT color
    // (no text-* class) resolve from the scoped .dark token set too, not from body.
    <div className="dark flex h-full w-full flex-col bg-accent-surface text-foreground">
      {/* org header */}
      <div className="flex items-center gap-1 px-2.5 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Workspace menu"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-accent-surface-hover"
            >
              <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                A
                {me && me.dndEnabled && (
                  <span
                    className={cn(
                      'absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-zinc-50 dark:ring-zinc-900',
                      isQuietHours(me) ? 'bg-amber-500' : 'bg-zinc-400 dark:bg-zinc-600',
                    )}
                    title="Do Not Disturb"
                    aria-label="Do Not Disturb is on"
                  >
                    <MoonStar className="h-2 w-2 text-white" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">{orgName}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-xl">
            <DropdownMenuLabel className="truncate">{orgName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="gap-2 opacity-50">
              <PenLine className="h-4 w-4" aria-hidden /> Invite teammates
              <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                const next = !(me?.dndEnabled ?? false)
                void useChatStore.getState().updateMe({ dndEnabled: next })
                toast.success(next ? 'Do Not Disturb is on' : 'Do Not Disturb is off')
              }}
            >
              <MoonStar className="h-4 w-4" aria-hidden />
              {me?.dndEnabled ? 'Turn off Do Not Disturb' : 'Turn on Do Not Disturb'}
              {me?.dndEnabled && me.dndStart && me.dndEnd && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {me.dndStart}–{me.dndEnd}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onClick={() => resolvedTheme === 'dark' ? setTheme('light') : setTheme('dark')}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
              {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => useChatStore.getState().setSettingsOpen(true)}>
              <Settings className="h-4 w-4" aria-hidden /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600 dark:focus:text-rose-400" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShortcutsOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
        >
          <Keyboard className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <NotificationBell />
      </div>

      {/* search trigger */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-accent-field px-2.5 py-1.5 text-sm text-foreground/75 transition-all duration-150 hover:border-border hover:bg-accent-surface-hover focus-visible:border-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:text-zinc-300 dark:focus-visible:border-emerald-400/40"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* saved items quick row */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => {
            setView('saved')
            // close the mobile drawer without routing back to chat
            useChatStore.getState().setDrawerOpen(false)
          }}
          aria-label={`Saved items${savedCount > 0 ? ` — ${savedCount} saved` : ''}`}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-all duration-150',
            view === 'saved'
              ? 'border-emerald-500/40 bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'border-transparent bg-accent-field text-foreground/80 hover:border-border hover:bg-accent-surface-hover',
          )}
        >
          <Bookmark
            className={cn('h-3.5 w-3.5 shrink-0', view === 'saved' && 'fill-current')}
            aria-hidden
          />
          <span className="flex-1 text-left font-medium">Saved items</span>
          {savedCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600/15 px-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </button>
      </div>

      {/* channel list */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {/* workspace section — mobile drawer only (desktop uses the icon rail) */}
        {showWorkspaceNav && (
          <section aria-label="Workspace" className="mb-3 mt-1">
            <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <div className="space-y-0.5">
              <WorkspaceRow icon={MessagesSquare} label="Threads" title="Threads you follow" target="threads" />
              <WorkspaceRow icon={Zap} label="Workflows" target="workflows" />
              <WorkspaceRow
                icon={Blocks}
                label="App directory"
                title="Connectors — Google Calendar, GitHub, Drive & more"
                target="connectors"
              />
              <WorkspaceRow
                icon={Plug}
                label="Integrations"
                title="Integrations — MCP server & API keys"
                target="integrations"
              />
              {isAdmin && (
                <WorkspaceRow icon={Shield} label="Admin" title="Admin dashboard" target="admin" />
              )}
            </div>
          </section>
        )}

        {/* channels section */}
        <section aria-label="Channels" className="mt-1">
          <div className="flex items-center gap-0.5 px-2 py-1">
            <button
              type="button"
              aria-label={channelsOpen ? 'Collapse channels' : 'Expand channels'}
              onClick={() => setChannelsOpen((v) => !v)}
              className="flex flex-1 items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-200 ease-out', !channelsOpen && '-rotate-90')}
                aria-hidden
              />
              Channels
            </button>
            <button
              type="button"
              aria-label="Browse channels"
              onClick={() => setBrowseChannelsOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Create channel"
              onClick={() => setCreateChannelOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {channelsOpen && (
            <div className="space-y-0.5">
              {memberChannels.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No channels yet</p>
              ) : (
                memberChannels.map((channel) => (
                  <ChannelRow key={channel.id} channel={channel} onRename={setRenameChannel} />
                ))
              )}
            </div>
          )}
        </section>

        {/* unified dm section — people + AI agents in one list */}
        <section aria-label="Direct messages" className="mt-3">
          <div className="flex items-center gap-0.5 px-2 py-1">
            <button
              type="button"
              aria-label={dmsOpen ? 'Collapse direct messages' : 'Expand direct messages'}
              onClick={() => setDmsOpen((v) => !v)}
              className="flex flex-1 items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-200 ease-out', !dmsOpen && '-rotate-90')}
                aria-hidden
              />
              Direct messages
            </button>
            <button
              type="button"
              aria-label="Manage agents"
              title="Manage AI agents"
              onClick={() => setAgentsDialogOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
            >
              <Bot className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="New direct message"
              title="New conversation — people & AI agents"
              onClick={() => setNewDmOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent-surface-hover hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {dmsOpen && (
            <div className="space-y-0.5">
              {dmChannels.map((channel) => (
                <ChannelRow key={channel.id} channel={channel} onRename={setRenameChannel} />
              ))}
              {agentLaunchers.map((agent) => (
                <AgentLauncherRow key={agent.id} agent={agent} onStart={(id) => void openAgentDm(id)} />
              ))}
              {dmChannels.length === 0 && agentLaunchers.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* agent management dialog */}
      <AgentDialog open={agentsDialogOpen} onOpenChange={setAgentsDialogOpen} />

      {/* rename-channel dialog (right-click menu) */}
      <RenameChannelDialog
        channel={renameChannel}
        onOpenChange={(open) => {
          if (!open) setRenameChannel(null)
        }}
      />

      {/* current user row */}
      {me && (
        <button
          type="button"
          onClick={() => setProfileUserId(me.id)}
          className="flex items-center gap-2.5 border-t border-border px-3 py-3 transition-colors duration-150 hover:bg-accent-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
          aria-label="Open my profile"
        >
          <UserAvatar user={me} size="sm" presence online />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium leading-snug">{me.name}</span>
            {(me.statusEmoji || me.statusText) && (
              <span className="mt-px block truncate text-xs leading-snug text-muted-foreground">
                {me.statusEmoji} {me.statusText}
              </span>
            )}
          </span>
        </button>
      )}
    </div>
  )
}
