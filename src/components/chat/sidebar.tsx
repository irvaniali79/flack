'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Bell,
  BellOff,
  Bookmark,
  Bot,
  CheckCheck,
  ChevronDown,
  Compass,
  Hash,
  Keyboard,
  Lock,
  LogOut,
  Moon,
  PenLine,
  Plug,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
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
import { useViewStore, type MainView } from '@/lib/view-store'
import type { ChannelDTO } from '@/lib/types'
import { UserAvatar } from './avatar'
import { PresenceDot } from './presence-dot'
import { AgentDialog } from './agents/agent-dialog'
import { formatRelativeTime } from '@/lib/time'

// ─── notification bell ───────────────────────────────────────────────────────

function NotificationBell() {
  const notifications = useChatStore((s) => s.notifications)
  const unread = useChatStore((s) => s.notificationsUnread)
  const fetchNotifications = useChatStore((s) => s.fetchNotifications)
  const markNotificationsRead = useChatStore((s) => s.markNotificationsRead)
  const openChannel = useChatStore((s) => s.openChannel)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) void fetchNotifications()
  }, [open, fetchNotifications])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ''}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => void markNotificationsRead()}
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">You&rsquo;re all caught up</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (notification.channelId) {
                    void openChannel(notification.channelId)
                  }
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent',
                  !notification.readAt && 'bg-emerald-500/5',
                )}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: notification.readAt ? 'transparent' : '#10b981' }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-[13px] leading-snug">{notification.body}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                    {notification.channelName ? ` · ${notification.channelName}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── channel row ─────────────────────────────────────────────────────────────

function UnreadBadge({ count, mentions }: { count: number; mentions: number }) {
  if (count <= 0) return null
  if (mentions > 0) {
    return (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
        {mentions > 9 ? '9+' : mentions}
      </span>
    )
  }
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-bold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function ChannelRow({ channel }: { channel: ChannelDTO }) {
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const openChannel = useChatStore((s) => s.openChannel)
  const presence = useChatStore((s) => s.presence)
  const users = useChatStore((s) => s.users)
  const active = activeChannelId === channel.id
  const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'

  const other = isDm && channel.members?.length ? channel.members[0] : null
  const online = other ? presence[other.id] : false

  const label = isDm
    ? channel.kind === 'dm'
      ? (other?.name ?? channel.name)
      : `${(channel.members ?? []).map((m) => m.name.split(' ')[0]).join(', ')}`
    : channel.name

  return (
    <button
      type="button"
      id={`sidebar-item-${channel.id}`}
      onClick={() => void openChannel(channel.id)}
      className={cn(
        'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 hover:translate-x-0.5',
        active
          ? 'bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'text-foreground/75 hover:bg-accent hover:text-foreground',
        channel.unread > 0 && !active && 'font-semibold text-foreground',
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
      {channel.isArchived && (
        <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
          arch
        </span>
      )}
      <UnreadBadge count={channel.unread} mentions={channel.mentionCount} />
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
          : 'text-foreground/75 hover:bg-accent hover:text-foreground',
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
  const [agentsOpen, setAgentsOpen] = useState(true)
  const [agentsDialogOpen, setAgentsDialogOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const memberChannels = useMemo(
    () => channels.filter((c) => c.kind !== 'dm' && c.kind !== 'group_dm' && c.isMember),
    [channels],
  )
  const dmChannels = useMemo(
    () => channels.filter((c) => c.kind === 'dm' || c.kind === 'group_dm'),
    [channels],
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
    <div className="flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-900">
      {/* org header */}
      <div className="flex items-center gap-1 px-2.5 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Workspace menu"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-accent"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                A
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
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
          className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-zinc-200/70 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-800/80"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
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
              : 'border-transparent bg-zinc-200/70 text-foreground/80 hover:border-border hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-800/80',
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
              <WorkspaceRow icon={Zap} label="Workflows" target="workflows" />
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
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Create channel"
              onClick={() => setCreateChannelOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {channelsOpen && (
            <div className="space-y-0.5">
              {memberChannels.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No channels yet</p>
              ) : (
                memberChannels.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
              )}
            </div>
          )}
        </section>

        {/* agents section */}
        <section aria-label="AI agents" className="mt-3">
          <div className="flex items-center gap-0.5 px-2 py-1">
            <button
              type="button"
              aria-label={agentsOpen ? 'Collapse agents' : 'Expand agents'}
              onClick={() => setAgentsOpen((v) => !v)}
              className="flex flex-1 items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-200 ease-out', !agentsOpen && '-rotate-90')}
                aria-hidden
              />
              Agents
            </button>
            <button
              type="button"
              aria-label="Manage agents"
              title="Manage agents"
              onClick={() => setAgentsDialogOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Bot className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {agentsOpen && (
            <div className="space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => void openAgentDm(agent.userId)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-foreground/75 transition-colors duration-150 hover:bg-accent hover:text-foreground"
                >
                  <UserAvatar user={agent.user} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{agent.user.name}</span>
                  <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* dm section */}
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
              aria-label="New direct message"
              onClick={() => setNewDmOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {dmsOpen && (
            <div className="space-y-0.5">
              {dmChannels.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet</p>
              ) : (
                dmChannels.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
              )}
            </div>
          )}
        </section>
      </div>

      {/* agent management dialog */}
      <AgentDialog open={agentsDialogOpen} onOpenChange={setAgentsDialogOpen} />

      {/* current user row */}
      {me && (
        <button
          type="button"
          onClick={() => setProfileUserId(me.id)}
          className="flex items-center gap-2.5 border-t border-border px-3 py-2.5 transition-colors duration-150 hover:bg-accent"
          aria-label="Open my profile"
        >
          <UserAvatar user={me} size="sm" presence online />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            {(me.statusEmoji || me.statusText) && (
              <span className="block truncate text-xs text-muted-foreground">
                {me.statusEmoji} {me.statusText}
              </span>
            )}
          </span>
        </button>
      )}
    </div>
  )
}
