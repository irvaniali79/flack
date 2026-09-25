// Mark a thread's reply notifications as read (called when the user opens the
// thread — from the Threads view or the thread panel; mirrors "reading it").
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

type Params = { params: Promise<{ rootId: string }> }

export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { rootId } = await params

    const root = await db.message.findUnique({
      where: { id: rootId },
      select: { id: true, channel: { select: { orgId: true, kind: true, id: true } } },
    })
    if (!root || root.channel.orgId !== me.orgId) throw new HttpError(404, 'Thread not found')
    if (root.channel.kind !== 'public') {
      const member = await db.channelMember.findFirst({
        where: { channelId: root.channel.id, userId: me.id },
        select: { id: true },
      })
      if (!member) throw new HttpError(403, 'You do not have access to this thread')
    }

    const replies = await db.message.findMany({
      where: { parentId: rootId },
      select: { id: true },
    })

    const updated = await db.notification.updateMany({
      where: {
        userId: me.id,
        type: 'thread_reply',
        readAt: null,
        messageId: { in: replies.map((r) => r.id) },
      },
      data: { readAt: new Date() },
    })

    return { ok: true, marked: updated.count }
  })
}

export const dynamic = 'force-dynamic'
