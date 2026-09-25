'use client'
// Singleton socket.io client bound to the gateway contract:
// io('/?XTransformPort=3003') — NEVER any other URL/path/port.
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { useChatStore } from './store'
import type { MessageDTO, NotificationDTO, ReactionDTO } from './types'

let socket: Socket | null = null
let identity: { userId: string; name: string } | null = null
let activeChannelId: string | null = null
let hadConnection = false
let typingLastSentAt = 0
const TYPING_THROTTLE_MS = 2500

export function initSocket(userId: string, name: string): void {
  identity = { userId, name }
  if (socket) return

  try {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 10_000,
    })
  } catch {
    socket = null
    return
  }

  const store = useChatStore

  socket.on('connect', () => {
    const s = store.getState()
    s.setConnected(true)
    if (identity) socket?.emit('hello', { userId: identity.userId, name: identity.name })

    // Request the online user list
    socket?.emit('presence:list', (res: unknown) => {
      try {
        const ids = Array.isArray(res)
          ? res
          : res && typeof res === 'object' && Array.isArray((res as { users?: string[] }).users)
            ? (res as { users: string[] }).users
            : []
        if (ids.length > 0) store.getState().setPresenceList(ids.map(String))
      } catch {
        // ignore malformed ack
      }
    })

    if (hadConnection) {
      // Reconnected after a drop: re-join the active room + resync
      if (activeChannelId) socket?.emit('channel:join', { channelId: activeChannelId })
      void store.getState().fetchBootstrap()
      const active = store.getState().activeChannelId
      if (active) void store.getState().fetchMessages(active)
    }
    hadConnection = true
  })

  socket.on('disconnect', () => {
    store.getState().setConnected(false)
  })

  socket.on('connect_error', () => {
    // Service may be down (parallel deployment) — stay silent, keep retrying.
    store.getState().setConnected(false)
  })

  socket.on('message:new', (payload: { message?: MessageDTO }) => {
    if (payload?.message) store.getState().handleNewMessage(payload.message)
  })

  socket.on('message:updated', (payload: { message?: MessageDTO }) => {
    if (payload?.message) store.getState().handleMessageUpdated(payload.message)
  })

  socket.on('message:deleted', (payload: { id?: string; channelId?: string }) => {
    if (payload?.id && payload?.channelId) {
      store.getState().handleMessageDeleted(payload.id, payload.channelId)
    }
  })

  socket.on('reaction:updated', (payload: {
    channelId?: string
    messageId?: string
    reactions?: ReactionDTO[]
  }) => {
    if (payload?.channelId && payload?.messageId && Array.isArray(payload.reactions)) {
      store.getState().handleReactionUpdated(payload.channelId, payload.messageId, payload.reactions)
    }
  })

  socket.on('typing', (payload: {
    channelId?: string
    userId?: string
    name?: string
    kind?: string
    stop?: boolean
  }) => {
    if (payload?.channelId && payload?.userId) {
      store
        .getState()
        .handleTyping(payload.channelId, payload.userId, payload.name ?? 'Someone', payload.kind, payload.stop)
    }
  })

  socket.on('presence:update', (payload: { userId?: string; online?: boolean }) => {
    if (payload?.userId) {
      store.getState().setPresence(payload.userId, !!payload.online)
    }
  })

  socket.on('notification:new', (payload: { notification?: NotificationDTO }) => {
    const notification = payload?.notification
    if (!notification) return
    const state = store.getState()
    state.handleNotification(notification)
    const me = state.me
    if (!me || me.dndEnabled) return
    toast(`${notification.actorName ?? 'Someone'} mentioned you`, {
      description: notification.body,
      action: notification.channelId
        ? {
            label: 'View',
            onClick: () => {
              void useChatStore.getState().openChannel(notification.channelId!)
            },
          }
        : undefined,
    })
  })

  socket.on('channels:refresh', () => {
    void store.getState().handleChannelsRefresh()
  })
}

export function getSocket(): Socket | null {
  return socket
}

export function socketJoinChannel(channelId: string): void {
  activeChannelId = channelId
  if (socket?.connected) socket.emit('channel:join', { channelId })
}

export function socketLeaveChannel(channelId: string): void {
  if (activeChannelId === channelId) activeChannelId = null
  if (socket?.connected) socket.emit('channel:leave', { channelId })
}

export function sendTyping(channelId: string, name: string): void {
  const now = Date.now()
  if (now - typingLastSentAt < TYPING_THROTTLE_MS) return
  typingLastSentAt = now
  if (socket?.connected) socket.emit('typing', { channelId, name })
}

export function disconnectSocket(): void {
  try {
    socket?.removeAllListeners()
    socket?.disconnect()
  } catch {
    // ignore
  }
  socket = null
  identity = null
  activeChannelId = null
  hadConnection = false
  useChatStore.getState().setConnected(false)
}
