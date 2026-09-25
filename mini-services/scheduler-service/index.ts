// scheduler-service — a deliberately DUMB ticker on port 3004.
// Every 60s it POSTs /api/internal/tick on the Next.js app (:3000) with the
// shared secret; all scheduling smarts (due detection, nextRunAt math,
// firing workflows) live in the app's workflow engine. Zero dependencies.
const PORT = 3004
const APP_HOST = process.env.APP_HOST ?? 'http://localhost:3000'
const TICK_URL = `${APP_HOST}/api/internal/tick`
const TICK_SECRET = process.env.TICK_SECRET ?? 'dev-tick-secret'
const TICK_INTERVAL_MS = 60_000
const TICK_TIMEOUT_MS = 5_000

const startedAt = Date.now()
let lastTickAt: number | null = null
let lastResult: unknown = null
let ticking = false
let tickCount = 0

function log(...args: unknown[]) {
  console.log(`[scheduler] ${new Date().toISOString()} ·`, ...args)
}

const server = Bun.serve({
  port: PORT,
  fetch(request: Request): Response {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        app: 'scheduler',
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        ticks: tickCount,
        lastTickAt,
        lastResult,
      })
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return Response.json({
        app: 'scheduler',
        port: PORT,
        target: TICK_URL,
        intervalMs: TICK_INTERVAL_MS,
        note: 'Dumb ticker — POSTs the app tick endpoint every 60s with the shared secret.',
      })
    }
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
  },
})

async function tick(): Promise<void> {
  if (ticking) {
    log('tick skipped — previous tick still in flight')
    return
  }
  ticking = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TICK_TIMEOUT_MS)
  try {
    const res = await fetch(TICK_URL, {
      method: 'POST',
      headers: { 'x-tick-secret': TICK_SECRET },
      signal: controller.signal,
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    lastResult = body
    tickCount += 1
    const fired =
      body && typeof body === 'object' && 'fired' in body ? ` fired=${(body as { fired?: number }).fired}` : ''
    log(`tick ${res.status}${fired}`)
  } catch (err) {
    lastResult = { ok: false, error: err instanceof Error ? err.message : 'tick failed' }
    log('tick failed:', err instanceof Error ? err.message : err)
  } finally {
    clearTimeout(timeout)
    ticking = false
    lastTickAt = Date.now()
  }
}

setInterval(() => {
  void tick()
}, TICK_INTERVAL_MS)

function shutdown(signal: string) {
  log(`received ${signal} — shutting down`)
  server.stop()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

log(`listening on :${PORT} — ticking ${TICK_URL} every ${TICK_INTERVAL_MS / 1000}s`)
