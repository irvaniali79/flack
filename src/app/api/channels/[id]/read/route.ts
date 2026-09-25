import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ messageId: z.string().min(1).nullable().optional() })

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new HttpError(400, 'messageId is required')

    const membership = await db.channelMember.findFirst({
      where: { channelId: id, userId: me.id },
    })
    if (!membership) throw new HttpError(403, 'You are not a member of this channel')

    if (parsed.data.messageId) {
      const message = await db.message.findFirst({
        where: { id: parsed.data.messageId, channelId: id },
        select: { id: true },
      })
      if (!message) throw new HttpError(400, 'Message not found in this channel')
    }

    await db.channelMember.update({
      where: { id: membership.id },
      data: { lastReadMessageId: parsed.data.messageId ?? null },
    })
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
