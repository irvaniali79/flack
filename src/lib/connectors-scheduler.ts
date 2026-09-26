// Autonomous connector event scheduler — driven by the 60s scheduler tick
// (mini-services/scheduler-service → /api/internal/tick). Every connected
// connection with autoEvents on behaves like a real integration receiving
// webhooks: it occasionally posts one of its subscribed events into the
// destination channel on its own, with no user interaction.
//
// Pacing model (per tick = 60s):
//   · Each connection fires independently with probability p.
//   · p scales with the number of live connections so an org with many
//     installs doesn't get flooded: p = clamp(1.5 / n, 0.06, 0.28)
//     → a single connection averages ~1 event / 3.5 min; twenty connections
//       still stay under ~1.5 events/min org-wide.
//   · Anti-flood: a connection never posts if the app user already posted in
//     the destination channel within the last 2 minutes.
//   · Per-tick org-wide cap of 3 events keeps bursts bounded.
//   · Only events the connection is actually subscribed to (eventSubs) post.
import { db } from '@/lib/db'
import {
  getConnectorDef,
  parseEventSubs,
  pickEventInstance,
  postConnectorEvent,
} from '@/lib/connectors'

const ORG_CAP_PER_TICK = 3
const ANTI_FLOOD_WINDOW_MS = 2 * 60 * 1000 // 2 minutes
const MIN_P = 0.06
const MAX_P = 0.28

// Best-effort in-memory pacing memory: the eventId each connection last fired,
// so a connection avoids posting the exact same event back-to-back (more
// realistic variety). Lost on restart — acceptable for pacing.
const lastFiredByConnection = new Map<string, string>()

export async function runConnectorTick(): Promise<number> {
  const connections = await db.connectorConnection.findMany({
    where: { status: 'connected', autoEvents: true },
    include: { channel: { select: { id: true, isArchived: true } } },
  })
  if (connections.length === 0) return 0

  const p = Math.min(MAX_P, Math.max(MIN_P, 1.5 / connections.length))
  let fired = 0

  for (const connection of connections) {
    if (fired >= ORG_CAP_PER_TICK) break
    if (connection.channel.isArchived) continue
    if (Math.random() > p) continue

    const def = getConnectorDef(connection.connectorId)
    if (!def) continue

    // Only post events this connection actually subscribes to
    const subs = parseEventSubs(connection.eventSubs)
    const onEvents = def.events.filter((e) => subs[e.id]).map((e) => e.id)
    if (onEvents.length === 0) continue

    // Anti-flood: skip if the app posted in this channel very recently
    const recent = await db.message.findFirst({
      where: {
        channelId: connection.channelId,
        senderId: connection.appUserId,
        createdAt: { gte: new Date(Date.now() - ANTI_FLOOD_WINDOW_MS) },
      },
      select: { id: true },
    })
    if (recent) continue

    // Prefer an event different from the last one this connection fired
    const lastFired = lastFiredByConnection.get(connection.id)
    const varied = onEvents.filter((id) => id !== lastFired)
    const pool = varied.length > 0 ? varied : onEvents
    const eventId = pool[Math.floor(Math.random() * pool.length)]
    const instance = pickEventInstance(def, eventId)
    if (!instance) continue

    try {
      await postConnectorEvent(connection, instance)
      lastFiredByConnection.set(connection.id, eventId)
      fired += 1
    } catch {
      // a down connection must never break the tick loop
    }
  }

  return fired
}
