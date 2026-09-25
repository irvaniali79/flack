// Forward (share) a message to another channel or DM.
// The forwarded message is a NEW message authored by the forwarder with a
// blockquote of the original — @mentions inside the quoted original do NOT
// re-notify (matching Slack share semantics); mentions in the optional note do.
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel, emitToUsers } from '@/lib/realtime-server'
import { parseMentions } from '@/lib/mentions'
import { maybeInvokeAgents } from '@/lib/agents/runtime'
import { maybeTriggerWorkflowsOnMessage } from '@/lib/workflows/runtime'
import { serializeMessage, serializeNotification } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'
import { writeAudit } from '@/lib/audit'
import { isQuietHours } from '@/lib/dnd'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  channelId: z.string().min(1),
  note: z.string().max(4000).optional(),
})

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'channelId is required')
    const { channelId, note } = parsed.data

    // ── Source message: must be visible to me (member or public channel) ──
    const source = await db.message.findUnique({
      where: { id },
      include: {
        channel: { include: { members: { where: { userId: me.id } } } },
        sender: { select: { name: true } },
      },
    })
    if (!source || source.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (source.channel.members.length === 0 && source.channel.kind !== 'public') {
      throw new HttpError(403, 'You do not have access to this message')
    }
    if (source.deletedAt) throw new HttpError(400, 'This message was deleted')

    // ── Target channel: must be a member (same rule as posting) ──
    const target = await db.channel.findFirst({
      where: { id: channelId, orgId: me.orgId },
      include: {
        members: {
          include: { user: { include: { agent: { select: { handle: true } } } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })
    if (!target) throw new HttpError(404, 'Target channel not found')
    if (!target.members.some((m) => m.userId === me.id)) {
      throw new HttpError(403, 'You are not a member of the target channel')
    }
    if (target.isArchived) throw new HttpError(400, 'The target channel is archived')

    // ── Compose the forwarded body ──
    const sourceWhere =
      source.channel.kind === 'dm' || source.channel.kind === 'group_dm'
        ? 'a DM'
        : `#${source.channel.name}`
    const senderName = source.sender?.name ?? 'Unknown'
    const quoted = source.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    const trimmedNote = (note ?? '').trim()
    const body = trimmedNote
      ? `**Forwarded** — ${senderName} in ${sourceWhere}:\n${quoted}\n\n${trimmedNote}`
      : `**Forwarded** — ${senderName} in ${sourceWhere}:\n${quoted}`

    // Mentions come from the NOTE only — quoting an @mention must not re-notify
    const candidates = target.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      handle: m.user.agent?.handle ?? null,
    }))
    const mentions = parseMentions(trimmedNote, candidates)

    const message = await db.message.create({
      data: {
        channelId: target.id,
        senderId: me.id,
        body,
        mentions: JSON.stringify(mentions),
      },
      include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
    })

    await db.channelMember.updateMany({
      where: { channelId: target.id, userId: me.id },
      data: { lastReadMessageId: message.id },
    })

    // Mention notifications from the note (mirrors the message route)
    const humansById = new Map(target.members.map((m) => [m.user.id, m.user]))
    const notifyUserIds = new Set<string>()
    for (const userId of mentions.userIds) {
      const user = humansById.get(userId)
      if (user && user.kind === 'human' && userId !== me.id) notifyUserIds.add(userId)
    }
    if (mentions.specials.length > 0) {
      for (const m of target.members) {
        if (m.user.kind === 'human' && m.userId !== me.id) notifyUserIds.add(m.userId)
      }
    }
    if (notifyUserIds.size > 0) {
      const where =
        target.kind === 'dm' ? 'a DM' : target.kind === 'group_dm' ? 'a group DM' : `#${target.name}`
      // Quiet hours per recipient — stored suppressed, no ding (digest delivers later)
      const quietByUser = new Map(
        [...notifyUserIds].map((userId) => [userId, isQuietHours(humansById.get(userId))]),
      )
      await db.notification.createMany({
        data: [...notifyUserIds].map((userId) => ({
          userId,
          type: mentions.specials.length > 0 ? 'mention_special' : 'mention',
          channelId: target.id,
          messageId: message.id,
          actorId: me.id,
          body: `${me.name} mentioned you in ${where}`,
          suppressed: quietByUser.get(userId) ?? false,
        })),
      })
      // Realtime ding per non-quiet user — proper DTOs so the client toasts
      const created = await db.notification.findMany({
        where: { messageId: message.id, userId: { in: [...notifyUserIds] } },
        orderBy: { createdAt: 'asc' },
      })
      const byUser = new Map<string, typeof created>()
      for (const n of created) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n])
      for (const [userId, list] of byUser) {
        if (quietByUser.get(userId)) continue // in quiet hours — no ding
        const latest = list[list.length - 1]
        const dto = serializeNotification({
          ...latest,
          channel: { name: target.name },
          actor: { name: me.name },
        })
        void emitToUsers([userId], 'notification:new', dto).catch(() => {})
      }
    }

    const dto = serializeMessage(message as MessageFull)
    void emitToChannel(target.id, 'message:new', { message: dto }).catch(() => {})

    // Forwards are normal messages: agents may reply, workflows may fire
    void maybeInvokeAgents({
      id: message.id,
      channelId: message.channelId,
      senderId: message.senderId,
      body: message.body,
      parentId: message.parentId,
    }).catch(() => {})
    void maybeTriggerWorkflowsOnMessage({
      id: message.id,
      channelId: message.channelId,
      body: message.body,
      senderId: message.senderId,
    }).catch(() => {})

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'message.forward',
      target: message.id,
      meta: {
        from: source.channel.name,
        to: target.name,
        sourceMessageId: source.id,
      },
    }).catch(() => {})

    return {
      message: dto,
      targetChannel: {
        id: target.id,
        name: target.name,
        kind: target.kind,
      },
    }
  })
}

export const dynamic = 'force-dynamic'
