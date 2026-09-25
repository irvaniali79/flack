// Internal scheduler tick endpoint — called every 60s by the scheduler
// mini-service (mini-services/scheduler-service, port 3004) with a shared
// secret. Fires all due schedule workflows via runScheduledTick().
import { runScheduledTick } from '@/lib/workflows/runtime'

export const dynamic = 'force-dynamic'

const TICK_SECRET = process.env.TICK_SECRET ?? 'dev-tick-secret'

export async function POST(request: Request) {
  if (request.headers.get('x-tick-secret') !== TICK_SECRET) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const fired = await runScheduledTick()
    return Response.json({ ok: true, fired })
  } catch {
    // Never leak internal error details to the caller.
    return Response.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
}
