import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel } from '@/lib/realtime-server'
import { maybeTriggerWorkflowsOnReaction } from '@/lib/workflows/runtime'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ emoji: z.string().min(1).max(32) })

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
    if (!parsed.success) throw new HttpError(400, 'emoji is required')
    const { emoji } = parsed.data

    const message = await db.message.findUnique({
      where: { id },
      include: { channel: { include: { members: { where: { userId: me.id } } } } },
    })
    if (!message) throw new HttpError(404, 'Message not found')
    if (message.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (message.channel.members.length === 0) throw new HttpError(403, 'You are not a member of this channel')
    if (message.deletedAt) throw new HttpError(400, 'This message was deleted')

    // Toggle this user's reaction
    const existing = await db.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId: message.id, userId: me.id, emoji } },
    })
    if (existing) {
      await db.reaction.delete({ where: { id: existing.id } })
    } else {
      await db.reaction.create({ data: { messageId: message.id, userId: me.id, emoji } })
    }

    const updated = await db.message.findUnique({
      where: { id: message.id },
      include: messageInclude,
    })
    if (!updated) throw new HttpError(404, 'Message not found')
    const dto = serializeMessage(updated as MessageFull)

    void emitToChannel(updated.channelId, 'reaction:updated', {
      channelId: updated.channelId,
      messageId: updated.id,
      reactions: dto.reactions,
    }).catch(() => {})
    void maybeTriggerWorkflowsOnReaction(updated.id, emoji, me.id).catch(() => {})

    return { reactions: dto.reactions }
  })
}

export const dynamic = 'force-dynamic'
