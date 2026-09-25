import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const root = await db.message.findUnique({
      where: { id },
      include: { channel: { include: { members: { where: { userId: me.id } } } } },
    })
    if (!root || root.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (root.channel.members.length === 0 && root.channel.kind !== 'public') {
      throw new HttpError(403, 'You do not have access to this thread')
    }

    const replies = await db.message.findMany({
      where: { parentId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        sender: { include: { agent: { select: { handle: true } } } },
        reactions: { include: { user: true } },
        files: true,
        _count: { select: { replies: true } },
      },
    })

    return { replies: replies.map((r) => serializeMessage(r as MessageFull)) }
  })
}

export const dynamic = 'force-dynamic'
