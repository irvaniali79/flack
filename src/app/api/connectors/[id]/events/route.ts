// POST /api/connectors/[id]/events — fire a realistic demo event through a
// connection ("Send a test event"). [id] = the ConnectorConnection id.
// Any workspace member can trigger it; pick a specific eventId or a random
// subscribed one.
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { getConnectorDef, parseEventSubs, pickEventInstance, postConnectorEvent } from '@/lib/connectors'

type Params = { params: Promise<{ id: string }> }

const bodySchema = z.object({ eventId: z.string().optional() }).default({})

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new HttpError(400, 'Invalid body')

    const connection = await db.connectorConnection.findFirst({
      where: { id, orgId: me.orgId },
    })
    if (!connection) throw new HttpError(404, 'Connection not found')
    if (connection.status !== 'connected') throw new HttpError(400, 'This connection is disconnected')

    const def = getConnectorDef(connection.connectorId)
    if (!def) throw new HttpError(500, 'Connector catalog missing')

    const subs = parseEventSubs(connection.eventSubs)
    let eventId = parsed.data.eventId
    if (eventId) {
      const known = def.events.find((e) => e.id === eventId)
      if (!known) throw new HttpError(400, `Unknown event “${eventId}” for ${def.name}`)
    } else {
      // Random pick among subscribed events (fall back to any)
      const on = def.events.filter((e) => subs[e.id]).map((e) => e.id)
      const pool = on.length > 0 ? on : def.events.map((e) => e.id)
      eventId = pool[Math.floor(Math.random() * pool.length)]
    }

    const instance = pickEventInstance(def, eventId)
    if (!instance) throw new HttpError(400, `No sample events available for “${eventId}”`)

    const { message } = await postConnectorEvent(connection, instance)

    return {
      message, // already a MessageDTO from postConnectorEvent
      event: { id: instance.eventId, title: instance.title },
    }
  })
}

export const dynamic = 'force-dynamic'
