'use client'
import { useTheme } from 'next-themes'
import {
  Hash,
  LogOut,
  MessageSquare,
  Moon,
  Plug,
  Settings,
  Shield,
  Sparkles,
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

  const homeActive = view === 'chat' && !!activeChannelId && general?.id === activeChannelId

  const goHome = () => {
    setView('chat')
    if (general) void openChannel(general.id)
  }

  const buttonClass = (active: boolean) =>
    cn(
      'relative flex h-11 w-11 items-center justify-center rounded-xl text-zinc-600 transition-colors duration-150 dark:text-zinc-400',
      'hover:bg-zinc-200/80 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
      active && 'bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
    )

  const accentClass = (active: boolean) =>
    cn(
      'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500 transition-all duration-150',
      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
    )

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-zinc-100 py-3 dark:border-zinc-800 dark:bg-zinc-950">
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

        <div className="my-2 h-px w-8 bg-zinc-300/80 dark:bg-zinc-800" aria-hidden />

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
              aria-label="New direct message"
              onClick={() => setNewDmOpen(true)}
              className={buttonClass(false)}
            >
              <MessageSquare className="h-5 w-5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Direct messages</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="AI agents"
              onClick={() => setNewDmOpen(true)}
              className={buttonClass(false)}
            >
              <Sparkles className="h-5 w-5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Chat with an AI agent</TooltipContent>
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
