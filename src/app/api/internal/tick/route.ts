// Internal scheduler tick endpoint — called every 60s by the scheduler
// mini-service (mini-services/scheduler-service, port 3004) with a shared
// secret. Fires all due schedule workflows via runScheduledTick(), releases
// quiet-hours digest notifications whose window has ended, releases expired
// notification snoozes, and streams autonomous connector events
// (runConnectorTick — connected apps post their subscribed events on their
// own, like real integrations receiving webhooks).
import { runScheduledTick } from '@/lib/workflows/runtime'
import { releaseQuietDigests, releaseSnoozedNotifications } from '@/lib/quiet-digest'
import { runConnectorTick } from '@/lib/connectors-scheduler'

export const dynamic = 'force-dynamic'

const TICK_SECRET = process.env.TICK_SECRET ?? 'dev-tick-secret'

export async function POST(request: Request) {
  if (request.headers.get('x-tick-secret') !== TICK_SECRET) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const fired = await runScheduledTick()
    const released = await releaseQuietDigests().catch(() => 0)
    const snoozesReleased = await releaseSnoozedNotifications().catch(() => 0)
    const connectorEvents = await runConnectorTick().catch(() => 0)
    return Response.json({ ok: true, fired, released, snoozesReleased, connectorEvents })
  } catch {
    // Never leak internal error details to the caller.
    return Response.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
}
