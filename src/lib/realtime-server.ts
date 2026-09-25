// Server-side helper to emit realtime events through the chat-service
// (mini-services/chat-service, socket.io on port 3003).
// All calls are fire-and-forget: a down service must never break an API route.

const SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3003'

async function post(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) console.error(`[realtime] ${path} responded ${res.status}`)
  } catch (err) {
    console.error(`[realtime] ${path} failed:`, err)
  }
}

/** Emit an event to a list of rooms (e.g. ["channel:abc", "user:xyz"]). */
export function emitToRooms(rooms: string[], event: string, data: unknown): Promise<void> {
  return post('/internal/emit', { rooms, event, data })
}

export function emitToChannel(channelId: string, event: string, data: unknown): Promise<void> {
  return emitToRooms([`channel:${channelId}`], event, data)
}

export function emitToUsers(userIds: string[], event: string, data: unknown): Promise<void> {
  return emitToRooms(
    userIds.map((id) => `user:${id}`),
    event,
    data,
  )
}

/** Show/hide a typing indicator for an AI agent in a channel. */
export function emitAgentTyping(channelId: string, agentName: string, stop = false): Promise<void> {
  return post('/internal/typing', { channelId, name: agentName, stop })
}
