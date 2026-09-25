'use client'
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { AuthScreen } from './auth-screen'
import { Rail } from './rail'
import { Sidebar } from './sidebar'
import { ChannelHeader } from './channel-header'
import { MessageList } from './message-list'
import { Composer } from './composer'
import { ThreadPanel } from './thread-panel'
import { NoChannelSelected } from './empty-states'
import { SearchOverlay } from './search-overlay'
import { CreateChannelDialog } from './dialogs/create-channel'
import { BrowseChannelsDialog } from './dialogs/browse-channels'
import { NewDmDialog } from './dialogs/new-dm'
import { ProfileDialog } from './dialogs/profile-dialog'
import { SettingsDialog } from './dialogs/settings-dialog'
import { ImageViewer } from './dialogs/image-viewer'
import { ShortcutsDialog } from './shortcuts-dialog'
import { SavedView } from './saved-view'
import { WorkflowsView } from './workflows/workflows-view'
import { AdminView } from './admin/admin-view'

function Splash() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white shadow-lg shadow-emerald-600/20">
        A
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading Acme Chat…
      </div>
    </div>
  )
}

export function ChatApp() {
  const me = useChatStore((s) => s.me)
  const bootstrapping = useChatStore((s) => s.bootstrapping)
  const fetchBootstrap = useChatStore((s) => s.fetchBootstrap)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const drawerOpen = useChatStore((s) => s.drawerOpen)
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const isMobile = useIsMobile()
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)

  useEffect(() => {
    void fetchBootstrap()
  }, [fetchBootstrap])

  // Opening a channel always returns to the chat view
  useEffect(() => {
    if (activeChannelId) setView('chat')
  }, [activeChannelId, setView])

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault()
        const state = useChatStore.getState()
        state.setShortcutsOpen(!state.shortcutsOpen)
        return
      }
      // Alt+↑/↓ — previous/next channel in sidebar order (channels, then DMs)
      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const state = useChatStore.getState()
        const order = [
          ...state.channels.filter((c) => c.kind !== 'dm' && c.kind !== 'group_dm' && c.isMember),
          ...state.channels.filter((c) => c.kind === 'dm' || c.kind === 'group_dm'),
        ]
        if (order.length === 0) return
        const current = order.findIndex((c) => c.id === state.activeChannelId)
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % order.length
            : (current - 1 + order.length) % order.length
        void state.openChannel(order[next].id)
        return
      }
      // Alt+Shift+↑/↓ — previous/next channel with unread messages
      if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const state = useChatStore.getState()
        const order = [
          ...state.channels.filter((c) => c.kind !== 'dm' && c.kind !== 'group_dm' && c.isMember),
          ...state.channels.filter((c) => c.kind === 'dm' || c.kind === 'group_dm'),
        ].filter((c) => c.unread > 0)
        if (order.length === 0) {
          toast.info('No unread channels — you’re all caught up ✨')
          return
        }
        const current = order.findIndex((c) => c.id === state.activeChannelId)
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % order.length
            : (current - 1 + order.length) % order.length
        void state.openChannel(order[next].id)
        return
      }
      if (event.key === 'Escape') {
        const state = useChatStore.getState()
        if (state.activeThreadRootId) state.closeThread()
        else if (state.drawerOpen) state.setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setSearchOpen])

  if (!me) {
    return bootstrapping ? <Splash /> : <AuthScreen />
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {!isMobile && <Rail />}
      {!isMobile && (
        <aside className="hidden w-64 shrink-0 border-r border-border md:block" aria-label="Channels sidebar">
          <Sidebar onNavigate={() => setView('chat')} />
        </aside>
      )}

      {/* mobile drawer */}
      <AnimatePresence>
        {isMobile && drawerOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border shadow-2xl"
              aria-label="Channels sidebar"
            >
              <button
                type="button"
                aria-label="Close sidebar"
                onClick={() => setDrawerOpen(false)}
                className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-background text-foreground shadow-lg transition-colors duration-150 hover:bg-accent"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <Sidebar
                onNavigate={() => {
                  setDrawerOpen(false)
                  setView('chat')
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'workflows' ? (
          <WorkflowsView />
        ) : view === 'admin' ? (
          <AdminView />
        ) : view === 'saved' ? (
          <SavedView />
        ) : (
          <>
            <ChannelHeader />
            {activeChannelId ? (
              <>
                <MessageList />
                <Composer />
              </>
            ) : (
              <NoChannelSelected />
            )}
          </>
        )}
      </main>

      {view === 'chat' && <ThreadPanel />}

      {/* overlays & dialogs */}
      <SearchOverlay />
      <CreateChannelDialog />
      <BrowseChannelsDialog />
      <NewDmDialog />
      <ProfileDialog />
      <SettingsDialog />
      <ImageViewer />
      <ShortcutsDialog />
    </div>
  )
}
