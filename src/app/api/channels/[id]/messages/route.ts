import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel, emitToUsers } from '@/lib/realtime-server'
import { parseMentions } from '@/lib/mentions'
import { maybeInvokeAgents } from '@/lib/agents/runtime'
import { maybeTriggerWorkflowsOnMessage } from '@/lib/workflows/runtime'
import { serializeMessage, serializeNotification } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

// ─── GET: paginated message history ──────────────────────────────────────────

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const url = new URL(request.url)
    const beforeId = url.searchParams.get('beforeId')
    const threadOf = url.searchParams.get('threadOf')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 100)

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: { members: { where: { userId: me.id } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    const isMember = channel.members.length > 0
    if (!isMember && channel.kind !== 'public') {
      throw new HttpError(403, 'You are not a member of this channel')
    }

    // Thread replies view
    if (threadOf) {
      const replies = await db.message.findMany({
        where: { channelId: channel.id, parentId: threadOf },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: messageInclude,
      })
      return { messages: replies.map(serializeMessage), hasMore: false }
    }

    // Top-level history (includes soft-deleted so the UI can render placeholders)
    let cursor: { createdAt: Date; id: string } | null = null
    if (beforeId) {
      const pivot = await db.message.findUnique({ where: { id: beforeId }, select: { createdAt: true, id: true } })
      if (pivot) cursor = pivot
    }

    const messages = await db.message.findMany({
      where: {
        channelId: channel.id,
        parentId: null,
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: messageInclude,
    })

    return { messages: messages.reverse().map(serializeMessage), hasMore: messages.length >= limit }
  })
}

export const dynamic = 'force-dynamic'

// ─── POST: the core "send message" route ─────────────────────────────────────

const postSchema = z.object({
  body: z.string().min(1).max(8000),
  fileIds: z.array(z.string()).max(10).optional(),
  parentId: z.string().optional().nullable(),
})

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = postSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Message body must be 1–8000 characters')
    const { body, fileIds, parentId } = parsed.data

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: {
        members: {
          include: { user: { include: { agent: { select: { handle: true } } } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    if (!channel.members.some((m) => m.userId === me.id)) {
      throw new HttpError(403, 'You are not a member of this channel')
    }
    if (channel.isArchived) throw new HttpError(400, 'This channel is archived')

    // Validate parent for thread replies
    let parent: { id: string } | null = null
    if (parentId) {
      parent = await db.message.findFirst({ where: { id: parentId, channelId: channel.id }, select: { id: true } })
      if (!parent) throw new HttpError(400, 'Thread root message not found')
    }

    // Parse @mentions against channel members (humans + agents w/ handles)
    const candidates = channel.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      handle: m.user.agent?.handle ?? null,
    }))
    const mentions = parseMentions(body, candidates)

    // Claim files (must be uploaded by me and not yet attached)
    const files = fileIds?.length
      ? await db.file.findMany({ where: { id: { in: fileIds }, uploaderId: me.id, messageId: null } })
      : []

    const message = await db.message.create({
      data: {
        channelId: channel.id,
        senderId: me.id,
        body,
        parentId: parent?.id ?? null,
        mentions: JSON.stringify(mentions),
        files: { connect: files.map((f) => ({ id: f.id })) },
      },
      include: messageInclude,
    })

    // Sender has obviously read their own message
    await db.channelMember.updateMany({
      where: { channelId: channel.id, userId: me.id },
      data: { lastReadMessageId: message.id },
    })

    // Notifications for mentioned humans (direct + @channel/@here)
    const humansById = new Map(channel.members.map((m) => [m.user.id, m.user]))
    const notifyUserIds = new Set<string>()
    let isSpecial = false
    for (const userId of mentions.userIds) {
      const user = humansById.get(userId)
      if (user && user.kind === 'human' && userId !== me.id) notifyUserIds.add(userId)
    }
    if (mentions.specials.length > 0) {
      isSpecial = true
      for (const m of channel.members) {
        if (m.user.kind === 'human' && m.userId !== me.id) notifyUserIds.add(m.userId)
      }
    }
    if (notifyUserIds.size > 0) {
      const where = channel.kind === 'dm' ? 'a DM' : channel.kind === 'group_dm' ? 'a group DM' : `#${channel.name}`
      const text = `${me.name} mentioned you in ${where}`
      const notifications = await db.notification.createMany({
        data: [...notifyUserIds].map((userId) => ({
          userId,
          type: isSpecial ? 'mention_special' : 'mention',
          channelId: channel.id,
          messageId: message.id,
          actorId: me.id,
          body: text,
        })),
      })
      if (notifications.count > 0) {
        const created = await db.notification.findMany({
          where: { messageId: message.id, userId: { in: [...notifyUserIds] } },
          orderBy: { createdAt: 'asc' },
        })
        const byUser = new Map<string, typeof created>()
        for (const n of created) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n])
        for (const [userId, list] of byUser) {
          // Only the newest notification for that user (one per message)
          const latest = list[list.length - 1]
          const dto = serializeNotification({
            ...latest,
            channel: { name: channel.name },
            actor: { name: me.name },
          })
          void emitToUsers([userId], 'notification:new', dto).catch(() => {})
        }
      }
    }

    const dto = serializeMessage(message as MessageFull)
    void emitToChannel(channel.id, 'message:new', { message: dto }).catch(() => {})

    // Fire-and-forget agent + workflow hooks (implemented by Tasks 3 & 4)
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

    return { message: dto }
  })
}
