import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel } from '@/lib/realtime-server'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ pinned: z.boolean() })

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
    if (!parsed.success) throw new HttpError(400, 'pinned (boolean) is required')

    const message = await db.message.findUnique({
      where: { id },
      include: { channel: { include: { members: { where: { userId: me.id } } } } },
    })
    if (!message || message.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (message.channel.members.length === 0) throw new HttpError(403, 'You are not a member of this channel')
    if (message.deletedAt) throw new HttpError(400, 'This message was deleted')

    const updated = await db.message.update({
      where: { id },
      data: { isPinned: parsed.data.pinned },
      include: messageInclude,
    })
    const dto = serializeMessage(updated as MessageFull)

    void emitToChannel(updated.channelId, 'message:updated', { message: dto }).catch(() => {})
    return { message: dto }
  })
}

export const dynamic = 'force-dynamic'
