// Internal scheduler tick endpoint — called every 60s by the scheduler
// mini-service (mini-services/scheduler-service, port 3004) with a shared
// secret. Fires all due schedule workflows via runScheduledTick() and
// releases quiet-hours digest notifications whose window has ended.
import { runScheduledTick } from '@/lib/workflows/runtime'
import { releaseQuietDigests } from '@/lib/quiet-digest'

export const dynamic = 'force-dynamic'

const TICK_SECRET = process.env.TICK_SECRET ?? 'dev-tick-secret'

export async function POST(request: Request) {
  if (request.headers.get('x-tick-secret') !== TICK_SECRET) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const fired = await runScheduledTick()
    const released = await releaseQuietDigests().catch(() => 0)
    return Response.json({ ok: true, fired, released })
  } catch {
    // Never leak internal error details to the caller.
    return Response.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
}
