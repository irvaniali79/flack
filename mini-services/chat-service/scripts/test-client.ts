// Smoke test for the chat-service (Task 1-b).
// Run with:  bun scripts/test-client.ts     (service must be running on :3003)
//
// Exercises the realtime protocol contract from Task 0 end-to-end:
// hello/presence, channel rooms, typing relay, internal emit endpoints,
// user-room notifications, agent typing and offline presence.

import { io, type Socket } from 'socket.io-client'

const URL = 'http://localhost:3003'
const DEFAULT_TIMEOUT = 4000

let passed = 0
let failed = 0

function report(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const show = (v: unknown) => JSON.stringify(v)

/** Wait for one matching event; resolves { ok: false } on timeout. */
function waitFor(
  socket: Socket,
  event: string,
  predicate: (data: any) => boolean,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<{ ok: boolean; data?: any }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, listener)
      resolve({ ok: false })
    }, timeoutMs)
    const listener = (data: any) => {
      if (predicate(data)) {
        clearTimeout(timer)
        socket.off(event, listener)
        resolve({ ok: true, data })
      }
    }
    socket.on(event, listener)
  })
}

/** Connect a client with the contract's transport options; null on failure. */
function connect(): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = io(URL, {
      path: '/',
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 3000,
    })
    const timer = setTimeout(() => {
      socket.disconnect()
      resolve(null)
    }, 3500)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
  })
}

/** presence:list with ack → string[] of online userIds, or null on failure. */
function presenceList(socket: Socket): Promise<string[] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), DEFAULT_TIMEOUT)
    socket.emit('presence:list', (res: unknown) => {
      clearTimeout(timer)
      resolve(Array.isArray(res) ? (res as string[]) : null)
    })
  })
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json }
}

async function main(): Promise<void> {
  console.log(`\nchat-service smoke test → ${URL}\n`)

  // ── health endpoint ──
  try {
    const res = await fetch(`${URL}/health`)
    const json: any = await res.json()
    report('GET /health → { ok:true }', res.status === 200 && json?.ok === true, show(json))
    report(
      'GET /health → sockets + onlineUsers counts',
      typeof json?.sockets === 'number' && typeof json?.onlineUsers === 'number',
      show(json),
    )
  } catch (err) {
    report('GET /health → { ok:true }', false, String(err))
  }

  // ── connect two clients ──
  const A = await connect()
  const B = await connect()
  report('client A connects', A !== null)
  report('client B connects', B !== null)
  if (!A || !B) return

  // ── hello → presence broadcast ──
  const bSeesA = waitFor(B, 'presence:update', (d) => d?.userId === 'test-a' && d?.online === true)
  A.emit('hello', { userId: 'test-a', name: 'A' })
  const rA = await bSeesA
  report('hello A → presence:update {userId:"test-a", online:true}', rA.ok, show(rA.data))

  const aSeesB = waitFor(A, 'presence:update', (d) => d?.userId === 'test-b' && d?.online === true)
  B.emit('hello', { userId: 'test-b', name: 'B' })
  const rB = await aSeesB
  report('hello B → presence:update {userId:"test-b", online:true}', rB.ok, show(rB.data))

  // ── channel rooms ──
  A.emit('channel:join', { channelId: 'room1' })
  B.emit('channel:join', { channelId: 'room1' })
  await sleep(300)

  // ── typing relay (A → B, excluding sender) ──
  const bTyping = waitFor(B, 'typing', (d) => d?.channelId === 'room1' && d?.userId === 'test-a')
  A.emit('typing', { channelId: 'room1', name: 'A' })
  const t1 = await bTyping
  report(
    'typing A → B receives {channelId:"room1", userId:"test-a", name:"A", kind:"human"}',
    t1.ok && t1.data?.name === 'A' && t1.data?.kind === 'human',
    show(t1.data),
  )

  const aSelf = waitFor(A, 'typing', (d) => d?.channelId === 'room1' && d?.userId === 'test-a', 700)
  A.emit('typing', { channelId: 'room1', name: 'A' })
  const t2 = await aSelf
  report('sender does not receive its own typing', !t2.ok, show(t2.data))

  // ── internal emit → message:new to channel room ──
  const aMsg = waitFor(A, 'message:new', (d) => d?.message?.id === 'x')
  const bMsg = waitFor(B, 'message:new', (d) => d?.message?.id === 'x')
  const emitRes = await post('/internal/emit', {
    rooms: ['channel:room1'],
    event: 'message:new',
    data: { message: { id: 'x', body: 'hello' } },
  })
  report(
    'POST /internal/emit → { ok:true, sent:1 }',
    emitRes.status === 200 && emitRes.json?.ok === true && emitRes.json?.sent === 1,
    show(emitRes.json),
  )
  const mA = await aMsg
  const mB = await bMsg
  report('A receives message:new {message:{id:"x", body:"hello"}}', mA.ok && mA.data?.message?.body === 'hello', show(mA.data))
  report('B receives message:new {message:{id:"x", body:"hello"}}', mB.ok && mB.data?.message?.body === 'hello', show(mB.data))

  // ── presence:list ack ──
  const online = await presenceList(A)
  report('presence:list ack → includes test-a and test-b', online !== null && online.includes('test-a') && online.includes('test-b'), show(online))

  // ── user room notification ──
  const bNotif = waitFor(B, 'notification:new', (d) => d?.notification?.id === 'n1')
  const aNotif = waitFor(A, 'notification:new', (d) => d?.notification?.id === 'n1', 700)
  const notifRes = await post('/internal/emit', {
    rooms: ['user:test-b'],
    event: 'notification:new',
    data: { notification: { id: 'n1', kind: 'mention' } },
  })
  const nb = await bNotif
  const na = await aNotif
  report(
    'emit to room user:test-b → B receives notification:new',
    nb.ok && notifRes.json?.ok === true,
    show(nb.data),
  )
  report("A does NOT receive B's notification", !na.ok, show(na.data))

  // ── agent typing endpoint ──
  const bAgentTyping = waitFor(B, 'typing', (d) => d?.userId === '__agent__')
  const typingRes = await post('/internal/typing', { channelId: 'room1', name: 'Aria' })
  const at = await bAgentTyping
  report(
    'POST /internal/typing → {channelId, userId:"__agent__", name:"Aria", kind:"agent", stop:false}',
    typingRes.json?.ok === true &&
      at.ok &&
      at.data?.channelId === 'room1' &&
      at.data?.name === 'Aria' &&
      at.data?.kind === 'agent' &&
      at.data?.stop === false,
    show(at.data),
  )

  // ── empty rooms emit (must not error) ──
  const emptyRes = await post('/internal/emit', { rooms: [], event: 'message:new', data: {} })
  report('POST /internal/emit with empty rooms → { ok:true, sent:0 }', emptyRes.json?.ok === true && emptyRes.json?.sent === 0, show(emptyRes.json))

  // ── offline presence on disconnect ──
  const aSeesBLeave = waitFor(A, 'presence:update', (d) => d?.userId === 'test-b' && d?.online === false)
  B.disconnect()
  const rLeave = await aSeesBLeave
  report('B disconnects → presence:update {userId:"test-b", online:false}', rLeave.ok, show(rLeave.data))
  await sleep(150)
  const onlineAfter = await presenceList(A)
  report(
    'presence:list after B leaves → still has test-a, no test-b',
    onlineAfter !== null && onlineAfter.includes('test-a') && !onlineAfter.includes('test-b'),
    show(onlineAfter),
  )

  A.disconnect()
}

let finished = false
function finish(): void {
  if (finished) return
  finished = true
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
  .then(finish)
  .catch((err) => {
    console.error('smoke test crashed:', err)
    process.exit(1)
  })
