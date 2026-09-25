// GET /api/connectors — the Slack-style app directory for this org:
// the full connector catalog with per-connector connection counts, plus the
// org's active connections.
import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { CONNECTORS, CONNECTOR_CATEGORIES } from '@/lib/connectors'
import { serializeConnection, serializeConnectorDef } from '@/lib/serialize'
import type { ConnectionFull } from '@/lib/serialize'

const connectionInclude = {
  channel: { select: { id: true, name: true, slug: true, kind: true } },
  appUser: { select: { id: true, name: true, avatarColor: true } },
  connectedBy: { select: { name: true } },
} as const

export async function GET() {
  return handle(async () => {
    const me = await requireUser()

    const connections = await db.connectorConnection.findMany({
      where: { orgId: me.orgId, status: 'connected' },
      include: connectionInclude,
      orderBy: { createdAt: 'asc' },
    })

    const counts = new Map<string, number>()
    for (const c of connections) counts.set(c.connectorId, (counts.get(c.connectorId) ?? 0) + 1)

    return {
      connectors: CONNECTORS.map((def) => serializeConnectorDef(def, counts.get(def.id) ?? 0)),
      connections: connections.map((c) => serializeConnection(c as ConnectionFull)),
      categories: CONNECTOR_CATEGORIES,
    }
  })
}

export const dynamic = 'force-dynamic'
