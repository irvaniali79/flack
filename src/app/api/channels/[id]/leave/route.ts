import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const channel = await db.channel.findFirst({ where: { id, orgId: me.orgId } })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const result = await db.channelMember.deleteMany({ where: { channelId: channel.id, userId: me.id } })
    if (result.count === 0) throw new HttpError(400, 'You are not a member of this channel')

    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
