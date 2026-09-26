// POST /api/channels/[id]/read — read-marker control for the Slack-style
// "Mark as read / Mark unread" features (context menus + channel ops).
//
// Body: { messageId?: string, mode?: 'read' | 'unread' | 'unread-from' }
//   · default            → set the marker to `messageId` (or clear it when absent)
//   · 'read'             → jump the marker to the channel's LATEST message
//   · 'unread'           → drop the marker to the message BEFORE the latest
//                          (classic Slack "mark channel unread": the newest
//                          message lights the row up again)
//   · 'unread-from' + id → marker to the message just before `messageId`
//                          ("mark unread from here" on a specific message)
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const schema = z
  .object({
    messageId: z.string().min(1).nullable().optional(),
    mode: z.enum(['read', 'unread', 'unread-from']).optional(),
  })
  .default({})

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new HttpError(400, 'Invalid body')

    const membership = await db.channelMember.findFirst({
      where: { channelId: id, userId: me.id },
    })
    if (!membership) throw new HttpError(403, 'You are not a member of this channel')

    let targetId: string | null = parsed.data.messageId ?? null

    if (parsed.data.mode === 'read' || parsed.data.mode === 'unread') {
      const latest = await db.message.findFirst({
        where: { channelId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      })
      if (!latest) return { ok: true, messageId: null } // empty channel — nothing to mark
      if (parsed.data.mode === 'read') {
        targetId = latest.id
      } else {
        const before = await db.message.findFirst({
          where: { channelId: id, createdAt: { lt: latest.createdAt } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        targetId = before?.id ?? null // only one message → everything unread
      }
    } else if (parsed.data.mode === 'unread-from' && parsed.data.messageId) {
      const anchor = await db.message.findFirst({
        where: { id: parsed.data.messageId, channelId: id },
        select: { createdAt: true },
      })
      if (!anchor) throw new HttpError(400, 'Message not found in this channel')
      const before = await db.message.findFirst({
        where: { channelId: id, createdAt: { lt: anchor.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      targetId = before?.id ?? null // anchor is the first message → all unread
    } else if (parsed.data.mode === 'unread-from') {
      throw new HttpError(400, 'messageId is required for unread-from')
    }

    if (targetId) {
      const message = await db.message.findFirst({
        where: { id: targetId, channelId: id },
        select: { id: true },
      })
      if (!message) throw new HttpError(400, 'Message not found in this channel')
    }

    await db.channelMember.update({
      where: { id: membership.id },
      data: { lastReadMessageId: targetId },
    })
    return { ok: true, messageId: targetId }
  })
}

export const dynamic = 'force-dynamic'
