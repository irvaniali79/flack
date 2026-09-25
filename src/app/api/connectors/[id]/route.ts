// PATCH /api/connectors/[id] — update a connection (destination channel,
// account label, event subscriptions). DELETE — disconnect it.
// [id] = the ConnectorConnection id. Admin/owner or the person who connected.
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { getConnectorDef } from '@/lib/connectors'
import { serializeConnection } from '@/lib/serialize'
import type { ConnectionFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const connectionInclude = {
  channel: { select: { id: true, name: true, slug: true, kind: true } },
  appUser: { select: { id: true, name: true, avatarColor: true } },
  connectedBy: { select: { name: true } },
} as const

const patchSchema = z.object({
  channelId: z.string().min(1).optional(),
  accountLabel: z.string().trim().min(3).max(120).optional(),
  eventIds: z.array(z.string()).max(20).optional(),
})

async function loadConnection(id: string, orgId: string) {
  const connection = await db.connectorConnection.findFirst({
    where: { id, orgId },
    include: connectionInclude,
  })
  if (!connection) throw new HttpError(404, 'Connection not found')
  if (connection.status !== 'connected') throw new HttpError(400, 'This connection is disconnected')
  return connection
}

function assertCanManage(role: string, connectedById: string | null, userId: string) {
  const isAdmin = role === 'owner' || role === 'admin'
  if (!isAdmin && connectedById !== userId) {
    throw new HttpError(403, 'Only admins or the connector owner can manage this connection')
  }
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const connection = await loadConnection(id, me.orgId)
    assertCanManage(me.role, connection.connectedById, me.id)

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Invalid connection fields')
    const data = parsed.data
    if (Object.keys(data).length === 0) return serializeConnection(connection as ConnectionFull)

    const def = getConnectorDef(connection.connectorId)
    if (!def) throw new HttpError(500, 'Connector catalog missing')

    const update: Record<string, unknown> = {}

    if (data.channelId && data.channelId !== connection.channelId) {
      const channel = await db.channel.findFirst({
        where: { id: data.channelId, orgId: me.orgId, isArchived: false },
      })
      if (!channel) throw new HttpError(404, 'Channel not found')
      if (channel.kind === 'dm' || channel.kind === 'group_dm') {
        throw new HttpError(400, 'Connectors can only post to channels, not DMs')
      }
      // Move the app user's membership to the new channel
      await db.channelMember.deleteMany({
        where: { channelId: connection.channelId, userId: connection.appUserId },
      })
      await db.channelMember
        .upsert({
          where: { channelId_userId: { channelId: channel.id, userId: connection.appUserId } },
          create: { channelId: channel.id, userId: connection.appUserId, role: 'member', notifyLevel: 'none' },
          update: {},
        })
        .catch(() => {})
      update.channelId = channel.id
    }

    if (data.accountLabel && data.accountLabel !== connection.accountLabel) {
      const clash = await db.connectorConnection.findFirst({
        where: {
          orgId: me.orgId,
          connectorId: connection.connectorId,
          accountLabel: data.accountLabel,
          status: 'connected',
          id: { not: connection.id },
        },
      })
      if (clash) throw new HttpError(409, `${def.name} is already connected as “${data.accountLabel}”`)
      update.accountLabel = data.accountLabel
    }

    if (data.eventIds) {
      const subs: Record<string, boolean> = {}
      const validIds = new Set(def.events.map((e) => e.id))
      for (const key of def.events.map((e) => e.id)) subs[key] = false
      for (const eventId of data.eventIds) {
        if (!validIds.has(eventId)) throw new HttpError(400, `Unknown event “${eventId}” for ${def.name}`)
        subs[eventId] = true
      }
      update.eventSubs = JSON.stringify(subs)
    }

    const updated = await db.connectorConnection.update({
      where: { id: connection.id },
      data: update,
      include: connectionInclude,
    })

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'connector.updated',
      target: def.name,
      meta: { connectionId: connection.id, fields: Object.keys(update) },
    })

    return serializeConnection(updated as ConnectionFull)
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const connection = await loadConnection(id, me.orgId)
    assertCanManage(me.role, connection.connectedById, me.id)

    const def = getConnectorDef(connection.connectorId)

    // A short farewell from the app, so the channel has a trace of the removal
    if (def) {
      const { postConnectorEvent } = await import('@/lib/connectors')
      await postConnectorEvent(connection, {
        eventId: 'disconnected',
        title: `${def.name} was disconnected`,
        body: `${def.name} (${connection.accountLabel}) was disconnected from this channel by ${me.name}. History stays — no new events will post.`,
        fields: [
          { label: 'Account', value: connection.accountLabel },
          { label: 'Removed by', value: me.name },
        ],
        footer: 'Reconnect anytime from the App Directory.',
      }).catch(() => {})
    }

    await db.connectorConnection.update({
      where: { id: connection.id },
      data: { status: 'disconnected' },
    })
    // The app user leaves the channel
    await db.channelMember.deleteMany({
      where: { channelId: connection.channelId, userId: connection.appUserId },
    })

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'connector.disconnected',
      target: def?.name ?? connection.connectorId,
      meta: { connectionId: connection.id },
    })

    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
