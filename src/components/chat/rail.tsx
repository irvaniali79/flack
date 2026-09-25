'use client'
import { useTheme } from 'next-themes'
import {
  Blocks,
  Hash,
  LogOut,
  MessageSquare,
  MessagesSquare,
  Moon,
  Plug,
  Settings,
  Shield,
  Sun,
  Zap,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { cn } from '@/lib/utils'

export function Rail() {
  const { resolvedTheme, setTheme } = useTheme()
  const channels = useChatStore((s) => s.channels)
  const notifications = useChatStore((s) => s.notifications)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const openChannel = useChatStore((s) => s.openChannel)
  const setNewDmOpen = useChatStore((s) => s.setNewDmOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const logout = useChatStore((s) => s.logout)
  const me = useChatStore((s) => s.me)
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)

  const general = channels.find((c) => c.slug === 'general') ?? channels.find((c) => c.kind === 'public')
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  // Unread thread replies — powers the Threads rail badge
  const threadUnread = notifications.filter(
    (n) => n.type === 'thread_reply' && !n.readAt && !n.suppressed,
  ).length

  const homeActive = view === 'chat' && !!activeChannelId && general?.id === activeChannelId

  const goHome = () => {
    setView('chat')
    if (general) void openChannel(general.id)
  }

  const buttonClass = (active: boolean) =>
    cn(
      'relative flex h-11 w-11 items-center justify-center rounded-xl text-zinc-700 transition-colors duration-150 dark:text-zinc-400',
      'hover:bg-accent-surface-hover hover:text-zinc-900 dark:hover:text-zinc-100',
      active && 'bg-accent-surface-hover text-zinc-900 dark:text-zinc-100',
    )

  const accentClass = (active: boolean) =>
    cn(
      'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500 transition-all duration-150',
      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
    )

  return (
    <TooltipProvider delayDuration={250}>
      {/* `dark` class — the rail renders the saturated dark chrome tokens in both modes */}
      <div className="dark flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-accent-surface-2 py-3">
        {/* org block */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Acme Inc workspace"
              onClick={goHome}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-sm font-black text-white shadow-sm transition-transform duration-150 hover:scale-105"
            >
              A
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Acme Inc</TooltipContent>
        </Tooltip>

        <div className="my-2 h-px w-8 bg-emerald-400/30 dark:bg-emerald-800/40" aria-hidden />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Home — open #general"
              onClick={goHome}
              className={cn(buttonClass(homeActive), 'group')}
            >
              <Hash className="h-5 w-5" aria-hidden />
              <span className={accentClass(homeActive)} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Threads${threadUnread > 0 ? ` — ${threadUnread} unread replies` : ''}`}
              aria-pressed={view === 'threads'}
              onClick={() => setView('threads')}
              className={cn(buttonClass(view === 'threads'), 'group')}
            >
              <MessagesSquare className="h-5 w-5" aria-hidden />
              {threadUnread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                  {threadUnread > 9 ? '9+' : threadUnread}
                </span>
              )}
              <span className={accentClass(view === 'threads')} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Threads you follow</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="New direct message — people & AI agents"
              onClick={() => setNewDmOpen(true)}
              className={buttonClass(false)}
            >
              <MessageSquare className="h-5 w-5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Direct messages — people & AI agents</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Workflows"
              aria-pressed={view === 'workflows'}
              onClick={() => setView('workflows')}
              className={cn(buttonClass(view === 'workflows'), 'group')}
            >
              <Zap className="h-5 w-5" aria-hidden />
              <span className={accentClass(view === 'workflows')} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Workflows</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="App directory — connectors"
              aria-pressed={view === 'connectors'}
              onClick={() => setView('connectors')}
              className={cn(buttonClass(view === 'connectors'), 'group')}
            >
              <Blocks className="h-5 w-5" aria-hidden />
              <span className={accentClass(view === 'connectors')} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">App directory — connectors</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Integrations"
              aria-pressed={view === 'integrations'}
              onClick={() => setView('integrations')}
              className={cn(buttonClass(view === 'integrations'), 'group')}
            >
              <Plug className="h-5 w-5" aria-hidden />
              <span className={accentClass(view === 'integrations')} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Integrations — MCP server & API keys</TooltipContent>
        </Tooltip>

        {isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Admin dashboard"
                aria-pressed={view === 'admin'}
                onClick={() => setView('admin')}
                className={cn(buttonClass(view === 'admin'), 'group')}
              >
                <Shield className="h-5 w-5" aria-hidden />
                <span className={accentClass(view === 'admin')} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Admin</TooltipContent>
          </Tooltip>
        )}

        <div className="mt-auto flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className={buttonClass(false)}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-5 w-5" aria-hidden />
                ) : (
                  <Moon className="h-5 w-5" aria-hidden />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
                className={buttonClass(false)}
              >
                <Settings className="h-5 w-5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Log out"
                onClick={() => void logout()}
                className={cn(
                  buttonClass(false),
                  'hover:text-rose-500 dark:hover:text-rose-400',
                )}
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Log out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
