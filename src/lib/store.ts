'use client'
// Central zustand store: session, data, realtime state, drafts + UI flags.
import { create } from 'zustand'
import { toast } from 'sonner'
import { api } from './api'
import { isAccentKey } from './theme-options'
import type {
  AgentDTO,
  ChannelDTO,
  MessageDTO,
  NotificationDTO,
  ReactionDTO,
  UserDTO,
} from './types'
import {
  disconnectSocket,
  initSocket,
  sendTyping,
  socketJoinChannel,
  socketLeaveChannel,
} from './socket'

const DRAFT_KEY = 'acme-drafts'
const SAVED_KEY = 'acme-saved-messages'
const ACCENT_KEY = 'acme-accent'

// Guards against a stale PATCH response clobbering a newer optimistic switch.
let accentRequestSeq = 0

/**
 * Apply an accent theme to <html data-accent='…'> and persist it for the
 * pre-paint script in layout.tsx. Empty/unknown values fall back to the
 * default ('emerald' has no CSS override — Tailwind's palette applies).
 */
function applyAccentTheme(key: string | null | undefined) {
  const value = key && key.trim() && isAccentKey(key) ? key : 'emerald'
  try {
    document.documentElement.dataset.accent = value
    localStorage.setItem(ACCENT_KEY, value)
  } catch {
    // storage unavailable — the attribute still applied above
  }
}

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function saveDrafts(drafts: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
  } catch {
    // ignore
  }
}

// ── saved messages (bookmarks) — ids persisted in localStorage ────────────────

function loadSavedIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveIds(ids: string[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

/** Find a message DTO among the currently loaded channels/threads. */
function findLoadedMessage(state: ChatState, id: string): MessageDTO | null {
  for (const list of Object.values(state.messagesByChannel)) {
    const hit = (list ?? []).find((m) => m.id === id)
    if (hit) return hit
  }
  for (const replies of Object.values(state.threadReplies)) {
    const hit = (replies ?? []).find((m) => m.id === id)
    if (hit) return hit
  }
  return null
}

let savedRefreshInFlight = false

export interface BootstrapResponse {
  me: UserDTO
  org: { name: string }
  users: UserDTO[]
  channels: ChannelDTO[]
  agents: AgentDTO[]
  notificationsUnread: number
}

export interface TypingEntry {
  name: string
  at: number
  kind?: string
}

interface ChatState {
  // ── data ──────────────────────────────────────────────────────────────────
  me: UserDTO | null
  orgName: string
  users: UserDTO[]
  channels: ChannelDTO[]
  agents: AgentDTO[]
  activeChannelId: string | null
  activeThreadRootId: string | null
  messagesByChannel: Record<string, MessageDTO[]>
  messagesLoading: Record<string, boolean>
  hasMoreByChannel: Record<string, boolean>
  loadingOlder: Record<string, boolean>
  unreadDividerByChannel: Record<string, string | null>
  threadReplies: Record<string, MessageDTO[]>
  threadLoading: boolean
  /** Whether the viewer follows each open thread root (rootId → following). */
  threadFollowing: Record<string, boolean>
  /** Follower count per thread root. */
  threadFollowerCount: Record<string, number>
  toggleThreadFollow: (rootId: string, follow: boolean) => Promise<void>
  presence: Record<string, boolean>
  typing: Record<string, Record<string, TypingEntry>>
  notifications: NotificationDTO[]
  notificationsUnread: number
  connected: boolean
  bootstrapping: boolean

  // ── drafts (persisted) ────────────────────────────────────────────────────
  drafts: Record<string, string>

  // ── saved messages (bookmarks, ids persisted) ─────────────────────────────
  savedMessageIds: string[]
  /** Cache of saved message DTOs for messages not currently loaded. */
  savedExtras: Record<string, MessageDTO>
  toggleSavedMessage: (id: string) => void
  isSaved: (id: string) => boolean
  /** Re-fetch saved messages that aren't in any loaded channel (lazy, fresh). */
  refreshSavedExtras: () => Promise<void>

  // ── ui state ──────────────────────────────────────────────────────────────
  searchOpen: boolean
  searchSeed: string
  shortcutsOpen: boolean
  createChannelOpen: boolean
  browseChannelsOpen: boolean
  newDmOpen: boolean
  settingsOpen: boolean
  profileUserId: string | null
  imageViewer: { url: string; name: string; size?: number } | null
  drawerOpen: boolean
  editingMessageId: string | null
  jumpToMessageId: string | null
  /** Message being forwarded (Forward dialog open when set). */
  forwardingMessageId: string | null
  setForwardingMessageId: (id: string | null) => void

  // ── actions ───────────────────────────────────────────────────────────────
  fetchBootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<{ requires2fa: true; challengeId: string; email: string } | null>
  verify2fa: (challengeId: string, code: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchChannels: () => Promise<void>
  fetchNotifications: () => Promise<void>
  openChannel: (channelId: string) => Promise<void>
  closeChannel: () => void
  fetchMessages: (channelId: string) => Promise<void>
  loadOlder: (channelId: string) => Promise<void>
  sendMessage: (body: string, fileIds?: string[], parentId?: string) => Promise<void>
  editMessage: (messageId: string, body: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  toggleReaction: (messageId: string, emoji: string) => Promise<void>
  togglePin: (messageId: string, pinned: boolean) => Promise<void>
  openThread: (rootId: string) => Promise<void>
  closeThread: () => void
  createChannel: (
    name: string,
    topic: string,
    kind: 'public' | 'private',
    memberIds: string[],
  ) => Promise<string | null>
  createDm: (userIds: string[]) => Promise<string | null>
  joinChannel: (channelId: string) => Promise<void>
  leaveChannel: (channelId: string) => Promise<void>
  addChannelMember: (channelId: string, userId: string) => Promise<void>
  updateChannel: (
    channelId: string,
    patch: { name?: string; topic?: string | null; isArchived?: boolean },
  ) => Promise<void>
  setNotifyPrefs: (channelId: string, patch: { notifyLevel?: ChannelDTO['notifyLevel']; muted?: boolean }) => Promise<void>
  markChannelRead: (channelId: string, messageId: string | null) => void
  setDraft: (channelId: string, text: string) => void
  updateMe: (patch: Partial<Pick<UserDTO, 'name' | 'title' | 'statusEmoji' | 'statusText' | 'dndEnabled' | 'dndStart' | 'dndEnd' | 'timezone' | 'emailNotif'>>) => Promise<void>
  /** Re-fetch the current user (e.g. after 2FA changes made via other endpoints). */
  refreshMe: () => Promise<void>
  /** Optimistically switch the accent color theme and persist it on the profile. */
  setAccentTheme: (key: string) => Promise<void>
  markNotificationsRead: (ids?: string[]) => Promise<void>
  snoozeNotification: (id: string, preset: { minutes?: number; until?: string }) => Promise<void>
  unsnoozeNotification: (id: string) => Promise<void>
  emitTyping: (channelId: string) => void

  // ── realtime handlers (called from socket.ts) ─────────────────────────────
  setConnected: (connected: boolean) => void
  setPresenceList: (userIds: string[]) => void
  setPresence: (userId: string, online: boolean) => void
  handleNewMessage: (message: MessageDTO) => void
  handleMessageUpdated: (message: MessageDTO) => void
  handleMessageDeleted: (id: string, channelId: string) => void
  handleReactionUpdated: (channelId: string, messageId: string, reactions: ReactionDTO[]) => void
  handleTyping: (channelId: string, userId: string, name: string, kind?: string, stop?: boolean) => void
  handleNotification: (notification: NotificationDTO) => void
  handleChannelsRefresh: () => Promise<void>

  // ── ui setters ────────────────────────────────────────────────────────────
  setSearchOpen: (open: boolean, seed?: string) => void
  setShortcutsOpen: (open: boolean) => void
  setCreateChannelOpen: (open: boolean) => void
  setBrowseChannelsOpen: (open: boolean) => void
  setNewDmOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setProfileUserId: (userId: string | null) => void
  setImageViewer: (viewer: { url: string; name: string; size?: number } | null) => void
  setDrawerOpen: (open: boolean) => void
  setEditingMessageId: (id: string | null) => void
  setJumpToMessageId: (id: string | null) => void
}

function replaceMessage(list: MessageDTO[], messageId: string, next: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === messageId)
  if (idx === -1) return list
  const copy = [...list]
  copy[idx] = next
  return copy
}

function bumpReplyCount(list: MessageDTO[], rootId: string, delta: number): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === rootId)
  if (idx === -1) return list
  const copy = [...list]
  copy[idx] = { ...copy[idx], replyCount: Math.max(0, copy[idx].replyCount + delta) }
  return copy
}

function touchChannel(channels: ChannelDTO[], channelId: string, message: MessageDTO): ChannelDTO[] {
  return channels.map((c) =>
    c.id === channelId
      ? {
          ...c,
          lastMessage: {
            body: message.body,
            createdAt: message.createdAt,
            senderName: message.sender?.name ?? null,
          },
        }
      : c,
  )
}

export const useChatStore = create<ChatState>((set, get) => ({
  me: null,
  orgName: 'Acme',
  users: [],
  channels: [],
  agents: [],
  activeChannelId: null,
  activeThreadRootId: null,
  messagesByChannel: {},
  messagesLoading: {},
  hasMoreByChannel: {},
  loadingOlder: {},
  unreadDividerByChannel: {},
  threadReplies: {},
  threadLoading: false,
  threadFollowing: {},
  threadFollowerCount: {},
  presence: {},
  typing: {},
  notifications: [],
  notificationsUnread: 0,
  connected: false,
  bootstrapping: false,

  drafts: typeof window !== 'undefined' ? loadDrafts() : {},

  savedMessageIds: typeof window !== 'undefined' ? loadSavedIds() : [],
  savedExtras: {},

  searchOpen: false,
  searchSeed: '',
  shortcutsOpen: false,
  createChannelOpen: false,
  browseChannelsOpen: false,
  newDmOpen: false,
  settingsOpen: false,
  profileUserId: null,
  imageViewer: null,
  drawerOpen: false,
  editingMessageId: null,
  jumpToMessageId: null,
  forwardingMessageId: null,

  // ── session ────────────────────────────────────────────────────────────────
  fetchBootstrap: async () => {
    set({ bootstrapping: true })
    try {
      const data = await api<BootstrapResponse>('/api/bootstrap')
      set({
        me: data.me,
        orgName: data.org.name,
        users: data.users,
        channels: data.channels,
        agents: data.agents,
        notificationsUnread: data.notificationsUnread,
        bootstrapping: false,
      })
      // Reconcile the pre-paint localStorage guess with the profile value
      // (server wins once you're logged in).
      applyAccentTheme(data.me.accentTheme)
      const { me } = get()
      if (me) initSocket(me.id, me.name)
      // custom emoji power message rendering + the picker — fetch alongside
      const { useCustomEmojiStore } = await import('./custom-emoji')
      void useCustomEmojiStore.getState().fetchCustomEmoji()
    } catch {
      set({ me: null, bootstrapping: false })
    }
  },

  login: async (email, password) => {
    const res = await api<
      { user: UserDTO } | { requires2fa: true; challengeId: string; email: string }
    >('/api/auth/login', { method: 'POST', body: { email, password } })
    if ('requires2fa' in res && res.requires2fa) {
      // Password OK — the account is 2FA-armed; the caller shows the code step
      return res
    }
    await get().fetchBootstrap()
    return null
  },

  /** Second login step for 2FA accounts: TOTP or recovery code → session. */
  verify2fa: async (challengeId, code) => {
    await api<{ user: UserDTO }>('/api/auth/login/2fa', {
      method: 'POST',
      body: { challengeId, code },
    })
    await get().fetchBootstrap()
  },

  register: async (email, name, password) => {
    await api<{ user: UserDTO }>('/api/auth/register', { method: 'POST', body: { email, name, password } })
    await get().fetchBootstrap()
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort
    }
    disconnectSocket()
    set({
      me: null,
      users: [],
      channels: [],
      agents: [],
      activeChannelId: null,
      activeThreadRootId: null,
      messagesByChannel: {},
      threadReplies: {},
      presence: {},
      typing: {},
      notifications: [],
      notificationsUnread: 0,
      drawerOpen: false,
      searchOpen: false,
      profileUserId: null,
      settingsOpen: false,
    })
  },

  fetchChannels: async () => {
    const { me } = get()
    if (!me) return
    try {
      const data = await api<{ channels: ChannelDTO[] }>('/api/channels')
      set({ channels: data.channels })
    } catch {
      // ignore — keep stale list
    }
  },

  fetchNotifications: async () => {
    try {
      const data = await api<{ notifications: NotificationDTO[] }>('/api/notifications')
      const now = Date.now()
      const isSnoozed = (n: NotificationDTO) =>
        n.snoozedUntil ? new Date(n.snoozedUntil).getTime() > now : false
      set({
        notifications: data.notifications,
        // Suppressed (quiet-hours) + snoozed notifications never count toward the badge
        notificationsUnread: data.notifications.filter(
          (n) => !n.readAt && !n.suppressed && !isSnoozed(n),
        ).length,
      })
    } catch {
      // ignore
    }
  },

  // ── channels ───────────────────────────────────────────────────────────────
  openChannel: async (channelId) => {
    const prev = get().activeChannelId
    if (prev && prev !== channelId) socketLeaveChannel(prev)
    set({ activeChannelId: channelId, activeThreadRootId: null, drawerOpen: false, editingMessageId: null })
    socketJoinChannel(channelId)

    const channel = get().channels.find((c) => c.id === channelId)
    const unread = channel?.unread ?? 0
    await get().fetchMessages(channelId)

    // Track the unread divider position before marking read
    const messages = get().messagesByChannel[channelId] ?? []
    let divider: string | null = null
    if (unread > 0 && messages.length > 0) {
      const idx = Math.max(0, messages.length - unread)
      divider = messages[idx]?.id ?? null
    }
    const last = messages[messages.length - 1]
    if (last) get().markChannelRead(channelId, last.id)
    set((s) => ({
      unreadDividerByChannel: { ...s.unreadDividerByChannel, [channelId]: divider },
    }))
  },

  closeChannel: () => {
    const prev = get().activeChannelId
    if (prev) socketLeaveChannel(prev)
    set({ activeChannelId: null, activeThreadRootId: null })
  },

  fetchMessages: async (channelId) => {
    if (get().messagesLoading[channelId]) return
    set((s) => ({ messagesLoading: { ...s.messagesLoading, [channelId]: true } }))
    try {
      const data = await api<{ messages: MessageDTO[]; hasMore: boolean }>(
        `/api/channels/${channelId}/messages?limit=50`,
      )
      set((s) => ({
        messagesByChannel: { ...s.messagesByChannel, [channelId]: data.messages },
        hasMoreByChannel: { ...s.hasMoreByChannel, [channelId]: data.hasMore },
        messagesLoading: { ...s.messagesLoading, [channelId]: false },
      }))
    } catch {
      set((s) => ({ messagesLoading: { ...s.messagesLoading, [channelId]: false } }))
    }
  },

  loadOlder: async (channelId) => {
    const { messagesByChannel, hasMoreByChannel, loadingOlder } = get()
    if (!hasMoreByChannel[channelId] || loadingOlder[channelId]) return
    const messages = messagesByChannel[channelId] ?? []
    const oldest = messages[0]
    if (!oldest) return
    set((s) => ({ loadingOlder: { ...s.loadingOlder, [channelId]: true } }))
    try {
      const data = await api<{ messages: MessageDTO[]; hasMore: boolean }>(
        `/api/channels/${channelId}/messages?limit=50&beforeId=${oldest.id}`,
      )
      set((s) => ({
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: [...data.messages, ...(s.messagesByChannel[channelId] ?? [])],
        },
        hasMoreByChannel: { ...s.hasMoreByChannel, [channelId]: data.hasMore },
        loadingOlder: { ...s.loadingOlder, [channelId]: false },
      }))
    } catch {
      set((s) => ({ loadingOlder: { ...s.loadingOlder, [channelId]: false } }))
    }
  },

  // ── messages ───────────────────────────────────────────────────────────────
  sendMessage: async (body, fileIds, parentId) => {
    const channelId = get().activeChannelId
    if (!channelId) return
    const data = await api<{ message: MessageDTO }>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: { body, fileIds, parentId },
    })
    const message = data.message
    set((s) => {
      if (message.parentId) {
        const replies = s.threadReplies[message.parentId] ?? []
        if (replies.some((r) => r.id === message.id)) return {}
        return {
          threadReplies: { ...s.threadReplies, [message.parentId]: [...replies, message] },
          messagesByChannel: {
            ...s.messagesByChannel,
            [channelId]: bumpReplyCount(s.messagesByChannel[channelId] ?? [], message.parentId, 1),
          },
          channels: touchChannel(s.channels, channelId, message),
          // Replying auto-follows the thread (server does this too — mirror locally)
          threadFollowing: { ...s.threadFollowing, [message.parentId]: true },
        }
      }
      const list = s.messagesByChannel[channelId] ?? []
      if (list.some((m) => m.id === message.id)) return {}
      return {
        messagesByChannel: { ...s.messagesByChannel, [channelId]: [...list, message] },
        channels: touchChannel(s.channels, channelId, message),
      }
    })
    // Clear typing indicator for me
    get().handleTyping(channelId, message.sender?.id ?? 'me', '', undefined, true)
  },

  editMessage: async (messageId, body) => {
    const data = await api<{ message: MessageDTO }>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: { body },
    })
    get().handleMessageUpdated(data.message)
    set({ editingMessageId: null })
  },

  deleteMessage: async (messageId) => {
    await api(`/api/messages/${messageId}`, { method: 'DELETE' })
    const { messagesByChannel } = get()
    const entry = Object.entries(messagesByChannel).find(([, list]) =>
      list.some((m) => m.id === messageId),
    )
    const channelId = entry?.[0]
    if (channelId) get().handleMessageDeleted(messageId, channelId)
    // also drop from thread replies if present
    set((s) => {
      const nextThreadReplies: Record<string, MessageDTO[]> = {}
      for (const [rootId, replies] of Object.entries(s.threadReplies)) {
        nextThreadReplies[rootId] = replies.map((r) =>
          r.id === messageId ? { ...r, deletedAt: new Date().toISOString(), isPinned: false } : r,
        )
      }
      return { threadReplies: nextThreadReplies }
    })
  },

  toggleReaction: async (messageId, emoji) => {
    const data = await api<{ reactions: ReactionDTO[] }>(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: { emoji },
    })
    const { messagesByChannel, threadReplies } = get()
    for (const [channelId] of Object.entries(messagesByChannel)) {
      if (messagesByChannel[channelId]?.some((m) => m.id === messageId)) {
        get().handleReactionUpdated(channelId, messageId, data.reactions)
      }
    }
    for (const [rootId, replies] of Object.entries(threadReplies)) {
      if (replies.some((m) => m.id === messageId)) {
        set((s) => ({
          threadReplies: {
            ...s.threadReplies,
            [rootId]: replies.map((r) => (r.id === messageId ? { ...r, reactions: data.reactions } : r)),
          },
        }))
      }
    }
  },

  togglePin: async (messageId, pinned) => {
    const data = await api<{ message: MessageDTO }>(`/api/messages/${messageId}/pin`, {
      method: 'POST',
      body: { pinned },
    })
    get().handleMessageUpdated(data.message)
  },

  // ── threads ────────────────────────────────────────────────────────────────
  openThread: async (rootId) => {
    set({ activeThreadRootId: rootId, threadLoading: true })
    // Reading a thread marks its reply notifications read (Threads view badge)
    void api(`/api/threads/${rootId}/read`, { method: 'POST' })
      .then(() => get().fetchNotifications())
      .catch(() => {})
    try {
      const data = await api<{ replies: MessageDTO[]; rootId?: string; following?: boolean; followerCount?: number }>(
        `/api/messages/${rootId}/replies`,
      )
      const effectiveRoot = data.rootId ?? rootId
      set((s) => ({
        threadReplies: { ...s.threadReplies, [rootId]: data.replies },
        ...(data.following === undefined
          ? {}
          : {
              threadFollowing: { ...s.threadFollowing, [effectiveRoot]: data.following },
              threadFollowerCount: {
                ...s.threadFollowerCount,
                [effectiveRoot]: data.followerCount ?? 0,
              },
            }),
        threadLoading: false,
      }))
    } catch {
      set({ threadLoading: false })
    }
  },

  toggleThreadFollow: async (rootId, follow) => {
    const data = await api<{ following: boolean; followerCount: number; rootId?: string }>(
      `/api/messages/${rootId}/follow`,
      { method: 'POST', body: { follow } },
    )
    const effectiveRoot = data.rootId ?? rootId
    set((s) => ({
      threadFollowing: { ...s.threadFollowing, [effectiveRoot]: data.following },
      threadFollowerCount: {
        ...s.threadFollowerCount,
        [effectiveRoot]: data.followerCount,
      },
    }))
  },

  closeThread: () => set({ activeThreadRootId: null, editingMessageId: null }),

  // ── channel mutations ─────────────────────────────────────────────────────
  createChannel: async (name, topic, kind, memberIds) => {
    try {
      const data = await api<{ id: string }>('/api/channels', {
        method: 'POST',
        body: { name, topic, kind, memberIds },
      })
      await get().fetchChannels()
      await get().openChannel(data.id)
      return data.id
    } catch (err) {
      throw err
    }
  },

  createDm: async (userIds) => {
    const data = await api<{ channel: ChannelDTO }>('/api/dms', { method: 'POST', body: { userIds } })
    const channel = data.channel
    set((s) => ({
      channels: s.channels.some((c) => c.id === channel.id) ? s.channels : [...s.channels, channel],
    }))
    await get().openChannel(channel.id)
    return channel.id
  },

  joinChannel: async (channelId) => {
    await api(`/api/channels/${channelId}/join`, { method: 'POST' })
    await get().fetchChannels()
    await get().openChannel(channelId)
  },

  leaveChannel: async (channelId) => {
    await api(`/api/channels/${channelId}/leave`, { method: 'POST' })
    const wasActive = get().activeChannelId === channelId
    await get().fetchChannels()
    if (wasActive) {
      const general = get().channels.find((c) => c.slug === 'general')
      if (general) await get().openChannel(general.id)
      else set({ activeChannelId: null })
    }
  },

  addChannelMember: async (channelId, userId) => {
    await api(`/api/channels/${channelId}/members`, { method: 'POST', body: { userId } })
    await get().fetchChannels()
  },

  updateChannel: async (channelId, patch) => {
    const data = await api<{ name: string; topic: string | null; isArchived: boolean }>(
      `/api/channels/${channelId}`,
      { method: 'PATCH', body: patch },
    )
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId
          ? { ...c, name: data.name, topic: data.topic, isArchived: data.isArchived }
          : c,
      ),
    }))
  },

  setNotifyPrefs: async (channelId, patch) => {
    // optimistic
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c)),
    }))
    try {
      await api(`/api/channels/${channelId}/members`, { method: 'PATCH', body: patch })
    } catch {
      await get().fetchChannels()
    }
  },

  markChannelRead: (channelId, messageId) => {
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId ? { ...c, unread: 0, mentionCount: 0 } : c,
      ),
    }))
    if (messageId) {
      void api(`/api/channels/${channelId}/read`, { method: 'POST', body: { messageId } }).catch(
        () => {},
      )
    }
  },

  setDraft: (channelId, text) => {
    set((s) => {
      const drafts = { ...s.drafts, [channelId]: text }
      saveDrafts(drafts)
      return { drafts }
    })
  },

  // ── saved messages (bookmarks) ────────────────────────────────────────────
  toggleSavedMessage: (id) => {
    set((s) => {
      const wasSaved = s.savedMessageIds.includes(id)
      const ids = wasSaved
        ? s.savedMessageIds.filter((x) => x !== id)
        : [id, ...s.savedMessageIds]
      saveIds(ids)
      let extras = s.savedExtras
      if (!wasSaved) {
        // snapshot the DTO so the saved view keeps working after the channel unloads
        const found = findLoadedMessage(s, id)
        if (found) extras = { ...s.savedExtras, [id]: found }
      } else {
        const rest = { ...s.savedExtras }
        delete rest[id]
        extras = rest
      }
      return { savedMessageIds: ids, savedExtras: extras }
    })
  },

  isSaved: (id) => get().savedMessageIds.includes(id),

  refreshSavedExtras: async () => {
    if (savedRefreshInFlight) return
    savedRefreshInFlight = true
    try {
      const ids = get().savedMessageIds.filter((id) => !findLoadedMessage(get(), id))
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const data = await api<{ message: MessageDTO }>(`/api/messages/${id}`)
            return [id, data.message] as const
          } catch {
            return null
          }
        }),
      )
      set((s) => {
        const extras = { ...s.savedExtras }
        for (const entry of results) if (entry) extras[entry[0]] = entry[1]
        return { savedExtras: extras }
      })
    } finally {
      savedRefreshInFlight = false
    }
  },

  updateMe: async (patch) => {
    const user = await api<UserDTO>('/api/me', { method: 'PATCH', body: patch })
    set((s) => ({
      me: user,
      users: s.users.map((u) => (u.id === user.id ? user : u)),
    }))
    applyAccentTheme(user.accentTheme)
  },

  refreshMe: async () => {
    try {
      const user = await api<UserDTO>('/api/me')
      set((s) => ({
        me: user,
        users: s.users.map((u) => (u.id === user.id ? user : u)),
      }))
      applyAccentTheme(user.accentTheme)
    } catch {
      // ignore — keep the current snapshot
    }
  },

  setAccentTheme: async (key) => {
    const me = get().me
    if (!me || !isAccentKey(key) || me.accentTheme === key) return
    const previous = me.accentTheme ?? 'emerald'
    const seq = ++accentRequestSeq
    // Optimistic — recolor immediately, then reconcile with the server.
    applyAccentTheme(key)
    set((s) => ({
      me: s.me ? { ...s.me, accentTheme: key } : s.me,
      users: s.users.map((u) => (u.id === me.id ? { ...u, accentTheme: key } : u)),
    }))
    try {
      const user = await api<UserDTO>('/api/me', { method: 'PATCH', body: { accentTheme: key } })
      if (seq !== accentRequestSeq) return // a newer switch superseded this one
      set((s) => ({
        me: user,
        users: s.users.map((u) => (u.id === user.id ? user : u)),
      }))
      applyAccentTheme(user.accentTheme)
    } catch (err) {
      if (seq !== accentRequestSeq) return
      applyAccentTheme(previous)
      set((s) => ({
        me: s.me ? { ...s.me, accentTheme: previous } : s.me,
        users: s.users.map((u) => (u.id === me.id ? { ...u, accentTheme: previous } : u)),
      }))
      toast.error(err instanceof Error ? err.message : 'Could not save accent theme')
    }
  },

  markNotificationsRead: async (ids) => {
    set((s) => {
      const patched = s.notifications.map((n) =>
        !ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      )
      return {
        notifications: patched,
        // Optimistic count of what remains unread (suppressed/snoozed never counted)
        notificationsUnread: patched.filter(
          (n) => !n.readAt && !n.suppressed && !(n.snoozedUntil && new Date(n.snoozedUntil) > new Date()),
        ).length,
      }
    })
    await api('/api/notifications', { method: 'POST', body: ids ? { ids } : {} })
    // Re-sync the badge with server truth
    void get().fetchNotifications()
  },

  snoozeNotification: async (id, preset) => {
    // Optimistic: hide it from the visible set until the refetch lands
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id
          ? {
              ...n,
              snoozedUntil: preset.until
                ? new Date(preset.until).toISOString()
                : new Date(Date.now() + (preset.minutes ?? 60) * 60 * 1000).toISOString(),
            }
          : n,
      ),
    }))
    try {
      await api('/api/notifications/snooze', { method: 'POST', body: { id, ...preset } })
    } finally {
      void get().fetchNotifications()
    }
  },

  unsnoozeNotification: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, snoozedUntil: null } : n)),
    }))
    try {
      await api('/api/notifications/snooze', { method: 'POST', body: { id, undo: true } })
    } finally {
      void get().fetchNotifications()
    }
  },

  emitTyping: (channelId) => {
    const me = get().me
    if (me) sendTyping(channelId, me.name)
  },

  // ── realtime handlers ──────────────────────────────────────────────────────
  setConnected: (connected) => set({ connected }),
  setPresenceList: (userIds) => {
    const me = get().me
    const presence: Record<string, boolean> = {}
    for (const id of userIds) presence[id] = true
    if (me) presence[me.id] = true
    set({ presence })
  },
  setPresence: (userId, online) =>
    set((s) => ({ presence: { ...s.presence, [userId]: online } })),

  handleNewMessage: (message) => {
    const me = get().me
    set((s) => {
      const isMine = !!me && message.sender?.id === me.id
      // Thread reply
      if (message.parentId) {
        const replies = s.threadReplies[message.parentId]
        const channels = touchChannel(s.channels, message.channelId, message)
        if (!replies) {
          return {
            channels,
            messagesByChannel: {
              ...s.messagesByChannel,
              [message.channelId]: bumpReplyCount(
                s.messagesByChannel[message.channelId] ?? [],
                message.parentId,
                1,
              ),
            },
          }
        }
        if (replies.some((r) => r.id === message.id)) return {}
        return {
          channels,
          threadReplies: { ...s.threadReplies, [message.parentId]: [...replies, message] },
          messagesByChannel: {
            ...s.messagesByChannel,
            [message.channelId]: bumpReplyCount(
              s.messagesByChannel[message.channelId] ?? [],
              message.parentId,
              1,
            ),
          },
        }
      }

      // Top-level message
      const list = s.messagesByChannel[message.channelId]
      const channels = touchChannel(s.channels, message.channelId, message)
      if (!list) {
        // Channel not loaded — bump unread counters instead
        return {
          channels: isMine
            ? channels
            : channels.map((c) =>
                c.id === message.channelId && c.isMember
                  ? { ...c, unread: c.unread + 1 }
                  : c,
              ),
        }
      }
      if (list.some((m) => m.id === message.id)) return {}
      const isActive = s.activeChannelId === message.channelId
      const shouldCountUnread = !isMine && !isActive
      return {
        channels: shouldCountUnread
          ? channels.map((c) =>
              c.id === message.channelId && c.isMember ? { ...c, unread: c.unread + 1 } : c,
            )
          : channels,
        messagesByChannel: { ...s.messagesByChannel, [message.channelId]: [...list, message] },
      }
    })
    // Clear the sender's typing indicator
    if (message.sender) {
      get().handleTyping(message.channelId, message.sender.id, '', undefined, true)
    }
    // If channel is active but window hidden, mark unread for badge (skip — keep simple)
  },

  handleMessageUpdated: (message) => {
    set((s) => {
      const list = s.messagesByChannel[message.channelId]
      return {
        messagesByChannel: list
          ? {
              ...s.messagesByChannel,
              [message.channelId]: replaceMessage(list, message.id, message),
            }
          : s.messagesByChannel,
        threadReplies: Object.fromEntries(
          Object.entries(s.threadReplies).map(([rootId, replies]) => [
            rootId,
            replaceMessage(replies, message.id, message),
          ]),
        ),
      }
    })
  },

  handleMessageDeleted: (id, channelId) => {
    const now = new Date().toISOString()
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).map((m) =>
          m.id === id ? { ...m, deletedAt: now, isPinned: false, reactions: [], files: [] } : m,
        ),
      },
    }))
  },

  handleReactionUpdated: (channelId, messageId, reactions) => {
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m,
        ),
      },
    }))
  },

  handleTyping: (channelId, userId, name, kind, stop) => {
    set((s) => {
      const channelTyping = { ...(s.typing[channelId] ?? {}) }
      if (stop) delete channelTyping[userId]
      else channelTyping[userId] = { name: name || 'Someone', at: Date.now(), kind }
      return { typing: { ...s.typing, [channelId]: channelTyping } }
    })
  },

  handleNotification: (notification) => {
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 50),
      notificationsUnread: notification.suppressed
        ? s.notificationsUnread
        : s.notificationsUnread + 1,
    }))
  },

  handleChannelsRefresh: async () => {
    await get().fetchChannels()
  },

  // ── ui setters ─────────────────────────────────────────────────────────────
  setSearchOpen: (open, seed = '') => set({ searchOpen: open, searchSeed: seed }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setCreateChannelOpen: (open) => set({ createChannelOpen: open }),
  setBrowseChannelsOpen: (open) => set({ browseChannelsOpen: open }),
  setNewDmOpen: (open) => set({ newDmOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setProfileUserId: (userId) => set({ profileUserId: userId }),
  setImageViewer: (viewer) => set({ imageViewer: viewer }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  setJumpToMessageId: (id) => set({ jumpToMessageId: id }),
  setForwardingMessageId: (id) => set({ forwardingMessageId: id }),
}))

// ── selectors (plain functions over getState) ────────────────────────────────

export function getActiveChannel(state: ChatState): ChannelDTO | null {
  return state.channels.find((c) => c.id === state.activeChannelId) ?? null
}

export function channelDisplayName(channel: ChannelDTO | null, meId: string | null): string {
  if (!channel) return ''
  if (channel.kind === 'dm') {
    const others = channel.members ?? []
    if (others.length === 1) return others[0].name
    return 'Direct message'
  }
  if (channel.kind === 'group_dm') {
    const others = (channel.members ?? []).map((m) => m.name.split(' ')[0])
    return others.join(', ') || channel.name
  }
  return channel.name
}
