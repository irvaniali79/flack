import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeChannel } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: { members: { include: { user: true } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')

    if (channel.members.some((m) => m.userId === me.id)) {
      return { ok: true, alreadyMember: true, channelId: channel.id }
    }
    if (channel.kind !== 'public' || channel.isArchived) {
      throw new HttpError(403, 'This channel is private — ask a member to invite you')
    }

    await db.channelMember.create({ data: { channelId: channel.id, userId: me.id } })

    const dto = serializeChannel(channel, me, {
      memberCount: channel.members.length + 1,
      isMember: true,
      unread: 0,
      mentionCount: 0,
      membership: null,
      lastMessage: null,
    })
    void emitToUsers([me.id], 'channels:refresh', { channelId: channel.id }).catch(() => {})
    return { ok: true, channel: dto }
  })
}

export const dynamic = 'force-dynamic'
