// POST /api/connectors/[id]/connect — the "Add to Slack"-style install flow
// (demo OAuth: account label + scopes are granted locally, no external
// round-trip). Admin/owner only. [id] = the connector catalog id
// ("google-calendar", …).
//
// Creates/revives the connection, creates the connector's bot "app" user if
// needed, joins it to the destination channel, and posts a rich "connected"
// app message there.
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import {
  defaultEventSubs,
  ensureAppUser,
  getConnectorDef,
  postConnectorEvent,
  type ConnectorEventInstance,
} from '@/lib/connectors'
import { serializeConnection } from '@/lib/serialize'
import type { ConnectionFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  channelId: z.string().min(1),
  accountLabel: z.string().trim().min(3).max(120),
  // Optional subset of the catalog's event ids to subscribe (default: defaults)
  eventIds: z.array(z.string()).max(20).optional(),
})

const connectionInclude = {
  channel: { select: { id: true, name: true, slug: true, kind: true } },
  appUser: { select: { id: true, name: true, avatarColor: true } },
  connectedBy: { select: { name: true } },
} as const

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    if (me.role !== 'owner' && me.role !== 'admin') {
      throw new HttpError(403, 'Only workspace owners and admins can add connectors')
    }
    const { id } = await params
    const def = getConnectorDef(id)
    if (!def) throw new HttpError(404, 'Unknown connector')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'A channel and an account label are required')
    const { channelId, accountLabel, eventIds } = parsed.data

    const channel = await db.channel.findFirst({
      where: { id: channelId, orgId: me.orgId, isArchived: false },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    if (channel.kind === 'dm' || channel.kind === 'group_dm') {
      throw new HttpError(400, 'Connectors can only post to channels, not DMs')
    }

    // Build the event subscription map (validate against the catalog)
    const subs = defaultEventSubs(def)
    if (eventIds) {
      for (const key of Object.keys(subs)) subs[key] = false
      const validIds = new Set(def.events.map((e) => e.id))
      for (const eventId of eventIds) {
        if (!validIds.has(eventId)) throw new HttpError(400, `Unknown event “${eventId}” for ${def.name}`)
        subs[eventId] = true
      }
    }

    // Revive an existing disconnected connection, or 409 if already live
    const existing = await db.connectorConnection.findFirst({
      where: { orgId: me.orgId, connectorId: def.id, accountLabel },
    })
    if (existing && existing.status === 'connected') {
      throw new HttpError(409, `${def.name} is already connected as “${accountLabel}”`)
    }

    // The connector's bot app user joins the destination channel
    const appUser = await ensureAppUser(me.orgId, def)
    await db.channelMember
      .upsert({
        where: { channelId_userId: { channelId: channel.id, userId: appUser.id } },
        create: { channelId: channel.id, userId: appUser.id, role: 'member', notifyLevel: 'none' },
        update: {},
      })
      .catch(() => {})

    const connection = existing
      ? await db.connectorConnection.update({
          where: { id: existing.id },
          data: {
            channelId: channel.id,
            eventSubs: JSON.stringify(subs),
            connectedById: me.id,
            status: 'connected',
          },
          include: connectionInclude,
        })
      : await db.connectorConnection.create({
          data: {
            orgId: me.orgId,
            connectorId: def.id,
            accountLabel,
            eventSubs: JSON.stringify(subs),
            channelId: channel.id,
            appUserId: appUser.id,
            connectedById: me.id,
            status: 'connected',
          },
          include: connectionInclude,
        })

    const onEvents = def.events.filter((e) => subs[e.id]).map((e) => e.label)
    const instance: ConnectorEventInstance = {
      eventId: 'connected',
      title: `${def.name} joined #${channel.name}`,
      body: `${def.name} was connected to #${channel.name} by ${me.name} (${accountLabel}). ${onEvents.length} event${onEvents.length === 1 ? '' : 's'} will post here.`,
      fields: [
        { label: 'Account', value: accountLabel },
        { label: 'Connected by', value: me.name },
        { label: 'Events', value: onEvents.length > 0 ? onEvents.join(', ') : 'None' },
      ],
      actions: [{ label: 'Send a test event', style: 'default' }],
      footer: 'Manage connectors anytime from the App Directory.',
    }
    const { message } = await postConnectorEvent(connection, instance)

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'connector.connected',
      target: def.name,
      meta: { connectorId: def.id, accountLabel, channelId: channel.id },
    })

    return {
      connection: serializeConnection(connection as ConnectionFull),
      message, // already a MessageDTO from postConnectorEvent
    }
  })
}

export const dynamic = 'force-dynamic'
