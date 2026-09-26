// chat-service — realtime socket.io gateway for Flack Chat (Task 1-b)
//
// Standalone Bun service (own package.json / deps). Listens on port 3003 (hardcoded).
// The socket.io path MUST stay '/' — the Caddy gateway routes browser traffic as
//   io("/?XTransformPort=3003")  →  this service.
//
// Routing note (important): with path '/', engine.io's internal request check
// matches EVERY url, so a dispatcher (see below) re-orders the 'request'
// listeners: the internal HTTP endpoints (/health, /internal/*, and plain
// GET / without a query string) are answered directly, while all socket
// traffic (urls like /?EIO=4&transport=polling) falls through to socket.io.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server, type Socket } from 'socket.io'

const PORT = 3003 // hardcoded — never from env

// ── helpers ──────────────────────────────────────────────────────────────

const ts = () => new Date().toISOString()

interface HelloUser {
  userId: string
  name: string
}

function getUser(socket: Socket): HelloUser | undefined {
  return (socket.data as { user?: HelloUser }).user
}

function setUser(socket: Socket, user: HelloUser): void {
  ;(socket.data as { user?: HelloUser }).user = user
}

// ── presence bookkeeping: userId → set of connected socket ids ───────────

const presence = new Map<string, Set<string>>()

/** Returns true when the user's socket count went 0 → 1 (came online). */
function registerSocket(userId: string, socketId: string): boolean {
  let ids = presence.get(userId)
  if (!ids) {
    ids = new Set()
    presence.set(userId, ids)
  }
  const wasOffline = ids.size === 0
  ids.add(socketId)
  return wasOffline
}

/** Returns true when the user's socket count hit 0 (went fully offline). */
function unregisterSocket(userId: string, socketId: string): boolean {
  const ids = presence.get(userId)
  if (!ids) return false
  ids.delete(socketId)
  if (ids.size === 0) {
    presence.delete(userId)
    return true
  }
  return false
}

// ── internal HTTP API (same http server as socket.io) ────────────────────

const MAX_BODY_BYTES = 5 * 1024 * 1024

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Parse a JSON body; returns undefined when the payload is not valid JSON. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0]

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      ok: true,
      uptime: Math.floor(process.uptime()),
      sockets: io.engine.clientsCount,
      onlineUsers: presence.size,
    })
  }

  if (req.method === 'GET' && (path === '/' || path === '')) {
    return sendJson(res, 200, { service: 'chat-service', status: 'running' })
  }

  if (req.method === 'POST' && path === '/internal/emit') {
    const body = await readJsonBody(req)
    if (typeof body !== 'object' || body === null) {
      return sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
    }
    const raw = body as { rooms?: unknown; event?: unknown; data?: unknown }
    const rooms = Array.isArray(raw.rooms)
      ? raw.rooms.filter((r): r is string => typeof r === 'string' && r.length > 0)
      : []
    if (rooms.length > 0 && (typeof raw.event !== 'string' || raw.event.length === 0)) {
      return sendJson(res, 400, { ok: false, error: 'missing event' })
    }
    if (typeof raw.event === 'string' && raw.event.length > 0) {
      for (const room of rooms) io.to(room).emit(raw.event, raw.data)
    }
    return sendJson(res, 200, { ok: true, sent: rooms.length })
  }

  if (req.method === 'POST' && path === '/internal/typing') {
    const body = await readJsonBody(req)
    if (typeof body !== 'object' || body === null) {
      return sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
    }
    const { channelId, name, stop } = body as { channelId?: unknown; name?: unknown; stop?: unknown }
    if (typeof channelId !== 'string' || channelId.length === 0 || typeof name !== 'string' || name.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'channelId and name are required' })
    }
    io.to(`channel:${channelId}`).emit('typing', {
      channelId,
      userId: '__agent__',
      name,
      kind: 'agent',
      stop: stop === true,
    })
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 404, { ok: false, error: `no route: ${req.method} ${path}` })
}

const httpServer = createServer()

// DO NOT change path '/' — the Caddy gateway depends on it.
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// With path '/', engine.io's internal check (`'/' === req.url.slice(0, 1)`)
// matches EVERY http request, which would swallow the internal HTTP API below.
// Fix: capture socket.io's own 'request' listeners, then install a dispatcher
// that runs FIRST — internal routes are answered directly, everything else
// (socket traffic: URLs like /?EIO=4&transport=polling) falls through to the
// original socket.io/engine.io handling, untouched.
const socketListeners = httpServer.listeners('request').slice(0) as unknown as Array<
  (req: IncomingMessage, res: ServerResponse) => void
>
httpServer.removeAllListeners('request')
httpServer.on('request', (req, res) => {
  const url = req.url ?? '/'
  const path = url.split('?')[0]
  const hasQuery = url.includes('?')
  const isInternal =
    (req.method === 'GET' && path === '/health') ||
    (req.method === 'GET' && path === '/' && !hasQuery) || // socket handshake is always /?…
    (req.method === 'POST' && (path === '/internal/emit' || path === '/internal/typing'))

  if (isInternal) {
    handleRequest(req, res).catch((err: unknown) => {
      console.error(`[${ts()}] http ${req.method} ${req.url} failed:`, err)
      if (!res.headersSent && !res.writableEnded) {
        const tooLarge = err instanceof Error && err.message === 'body too large'
        sendJson(res, tooLarge ? 413 : 500, { ok: false, error: tooLarge ? 'body too large' : 'internal error' })
      }
    })
    return
  }

  for (const listener of socketListeners) {
    try {
      listener.call(httpServer as never, req, res)
    } catch (err) {
      console.error(`[${ts()}] socket request listener failed:`, err)
    }
  }
})

// ── socket wiring ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[${ts()}] connect      socket=${socket.id} sockets=${io.engine.clientsCount}`)

  // Wrap handlers so a bad payload can never crash the service.
  const on = (event: string, handler: (...args: unknown[]) => void): void => {
    socket.on(event, (...args: unknown[]) => {
      try {
        handler(...args)
      } catch (err) {
        console.error(`[${ts()}] '${event}' handler failed (socket=${socket.id}):`, err)
      }
    })
  }

  on('hello', (payload) => {
    const p = (payload ?? {}) as Record<string, unknown>
    const userId = p.userId
    const name = p.name
    if (typeof userId !== 'string' || userId.length === 0) {
      console.warn(`[${ts()}] hello: missing userId from socket=${socket.id} — ignored`)
      return
    }
    // re-hello with a different userId → clean up the old registration first
    const prev = getUser(socket)
    if (prev && prev.userId !== userId && unregisterSocket(prev.userId, socket.id)) {
      io.emit('presence:update', { userId: prev.userId, online: false })
    }
    setUser(socket, {
      userId,
      name: typeof name === 'string' && name.length > 0 ? name : userId,
    })
    socket.join(`user:${userId}`)
    if (registerSocket(userId, socket.id)) {
      io.emit('presence:update', { userId, online: true }) // only on 0 → 1
    }
    console.log(`[${ts()}] hello        user=${userId} socket=${socket.id} onlineUsers=${presence.size}`)
  })

  on('channel:join', (payload) => {
    const channelId = (payload as Record<string, unknown> | null | undefined)?.channelId
    if (typeof channelId !== 'string' || channelId.length === 0) {
      console.warn(`[${ts()}] channel:join: bad payload from socket=${socket.id} — ignored`)
      return
    }
    socket.join(`channel:${channelId}`)
  })

  on('channel:leave', (payload) => {
    const channelId = (payload as Record<string, unknown> | null | undefined)?.channelId
    if (typeof channelId !== 'string' || channelId.length === 0) {
      console.warn(`[${ts()}] channel:leave: bad payload from socket=${socket.id} — ignored`)
      return
    }
    socket.leave(`channel:${channelId}`)
  })

  on('typing', (payload) => {
    const p = (payload ?? {}) as Record<string, unknown>
    const channelId = p.channelId
    const name = p.name
    if (typeof channelId !== 'string' || channelId.length === 0) {
      console.warn(`[${ts()}] typing: bad payload from socket=${socket.id} — ignored`)
      return
    }
    const user = getUser(socket)
    socket.to(`channel:${channelId}`).emit('typing', {
      channelId,
      userId: user?.userId ?? 'unknown',
      name: typeof name === 'string' && name.length > 0 ? name : (user?.name ?? 'unknown'),
      kind: 'human',
    })
  })

  on('presence:list', (...args) => {
    const ack = args.find((a): a is (res: string[]) => void => typeof a === 'function')
    if (!ack) {
      console.warn(`[${ts()}] presence:list without ack callback from socket=${socket.id}`)
      return
    }
    ack([...presence.keys()])
  })

  socket.on('disconnect', (reason) => {
    const user = getUser(socket)
    if (user) {
      if (unregisterSocket(user.userId, socket.id)) {
        io.emit('presence:update', { userId: user.userId, online: false })
      }
      console.log(`[${ts()}] disconnect   user=${user.userId} socket=${socket.id} reason=${reason} onlineUsers=${presence.size}`)
    } else {
      console.log(`[${ts()}] disconnect   socket=${socket.id} reason=${reason} (no hello)`)
    }
  })

  socket.on('error', (err) => {
    console.error(`[${ts()}] socket error ${socket.id}:`, err)
  })
})

// ── lifecycle ────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[${ts()}] chat-service listening on :${PORT} (socket.io path '/')`)
})

httpServer.on('error', (err) => {
  console.error(`[${ts()}] http server error:`, err)
  process.exit(1)
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[${ts()}] ${signal} received — shutting down`)
  httpServer.close(() => process.exit(0))
  io.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Never crash on stray async errors — log and keep serving.
process.on('uncaughtException', (err) => {
  console.error(`[${ts()}] uncaughtException (service stays up):`, err)
})
process.on('unhandledRejection', (err) => {
  console.error(`[${ts()}] unhandledRejection (service stays up):`, err)
})
