// POST /api/connectors/actions — REAL interactive app-card actions.
// Clicking "Join meeting", "Approve", "Respond", … on a connector message
// posts a realistic outcome message from the app into the channel and ticks
// ✅ on the original card (reaction from the app user), exactly like a Slack
// app interaction. Body: { messageId, action }.
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel } from '@/lib/realtime-server'
import {
  getConnectorDef,
  parseEventSubs,
  pickEventInstance,
  postConnectorEvent,
  type ConnectorEventInstance,
} from '@/lib/connectors'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

const schema = z.object({
  messageId: z.string().min(1),
  action: z.string().trim().min(1).max(80),
})

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

/** Map an action button label to a natural completion verb. */
function verbFor(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('join')) return 'joined'
  if (a.includes('approve')) return 'approved'
  if (a.includes('decline') || a.includes('reject')) return 'declined'
  if (a.includes('accept')) return 'accepted'
  if (a.includes('review')) return 'started a review on'
  if (a.includes('respond')) return 'responded to'
  if (a.includes('reply') || a.includes('comment')) return 'replied to'
  if (a.includes('remind')) return 'set a reminder for'
  if (a.includes('merge')) return 'merged'
  if (a.includes('close')) return 'closed'
  if (a.includes('complete') || a.includes('done')) return 'marked complete'
  if (a.includes('archive')) return 'archived'
  if (a.includes('share') || a.includes('copy')) return 'shared'
  if (a.includes('open') || a.includes('see ') || a.includes('view') || a.includes('watch') || a.includes('preview') || a.includes('visit'))
    return 'opened'
  return 'responded to'
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'messageId and action are required')
    const { messageId, action } = parsed.data

    const message = await db.message.findUnique({
      where: { id: messageId },
      include: { channel: { include: { members: { where: { userId: me.id } } } } },
    })
    if (!message) throw new HttpError(404, 'Message not found')
    if (message.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (message.channel.members.length === 0) throw new HttpError(403, 'You are not a member of this channel')
    if (!message.connectorId || !message.connectorPayload) {
      throw new HttpError(400, 'This message is not an interactive app card')
    }

    const def = getConnectorDef(message.connectorId)
    if (!def) throw new HttpError(500, 'Connector catalog missing')

    // Resolve the live connection for this app in this channel
    const connection = await db.connectorConnection.findFirst({
      where: {
        orgId: me.orgId,
        connectorId: message.connectorId,
        channelId: message.channelId,
        status: 'connected',
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!connection) throw new HttpError(409, `${def.name} is no longer connected to this channel`)

    let instance: ConnectorEventInstance

    if (action.toLowerCase() === 'send a test event') {
      // The "connected" card's button fires a real subscribed event
      const subs = parseEventSubs(connection.eventSubs)
      const on = def.events.filter((e) => subs[e.id]).map((e) => e.id)
      const pool = on.length > 0 ? on : def.events.map((e) => e.id)
      const eventId = pool[Math.floor(Math.random() * pool.length)]
      const picked = pickEventInstance(def, eventId)
      if (!picked) throw new HttpError(400, `No sample events available for "${eventId}"`)
      instance = picked
    } else {
      // Read the original card title for natural phrasing
      let originalTitle = message.connectorId
      try {
        const payload = JSON.parse(message.connectorPayload) as { title?: string }
        if (payload.title) originalTitle = payload.title
      } catch {
        // keep fallback title
      }
      const trimmedTitle =
        originalTitle.length > 80 ? `${originalTitle.slice(0, 77)}…` : originalTitle
      const verb = verbFor(action)

      instance = {
        eventId: 'action',
        title: `${me.name} ${verb} "${trimmedTitle}"`,
        body: `${me.name} ${verb} "${trimmedTitle}" via ${def.name}.`,
        fields: [
          { label: 'Actor', value: me.name },
          { label: 'Action', value: action },
          { label: 'On', value: trimmedTitle },
          { label: 'Account', value: connection.accountLabel },
        ],
        footer: `${def.name} · interaction handled in-channel`,
      }
    }

    // Post the outcome as the app user (also refreshes lastEventAt telemetry)
    const { message: outcome } = await postConnectorEvent(connection, instance)

    // Tick ✅ on the original card — reaction from the app user itself. This
    // both marks the card completed for every client (realtime + reloads) and
    // reads as the app acknowledging the interaction.
    const alreadyTicked = await db.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: message.id,
          userId: connection.appUserId,
          emoji: '✅',
        },
      },
    })
    if (!alreadyTicked) {
      await db.reaction.create({
        data: { messageId: message.id, userId: connection.appUserId, emoji: '✅' },
      })
      const refreshed = await db.message.findUnique({
        where: { id: message.id },
        include: messageInclude,
      })
      if (refreshed) {
        const dto = serializeMessage(refreshed as MessageFull)
        void emitToChannel(refreshed.channelId, 'reaction:updated', {
          channelId: refreshed.channelId,
          messageId: refreshed.id,
          reactions: dto.reactions,
        }).catch(() => {})
      }
    }

    return {
      message: outcome,
      title: instance.title,
      channelName: message.channel.name,
    }
  })
}

export const dynamic = 'force-dynamic'
