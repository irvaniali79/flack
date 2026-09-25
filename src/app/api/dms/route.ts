import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { loadChannelsForViewer } from '@/lib/channel-list'
import { serializeChannel } from '@/lib/serialize'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const all = await loadChannelsForViewer(me)
    return { channels: all.filter((c) => c.kind === 'dm' || c.kind === 'group_dm') }
  })
}

const schema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(7),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Provide 1–7 other people for a DM')
    const otherIds = [...new Set(parsed.data.userIds)].filter((id) => id !== me.id)
    if (otherIds.length === 0) throw new HttpError(400, 'Pick at least one other person')

    const others = await db.user.findMany({
      where: { id: { in: otherIds }, orgId: me.orgId, isActive: true },
    })
    if (others.length !== otherIds.length) throw new HttpError(404, 'One or more users were not found')

    const allIds = [me.id, ...otherIds].sort()
    const kind = otherIds.length === 1 ? 'dm' : 'group_dm'
    const slug = `${kind === 'dm' ? 'dm' : 'gdm'}-${allIds.join('-')}`

    const existing = await db.channel.findFirst({
      where: { orgId: me.orgId, slug },
      include: { members: { include: { user: true } } },
    })

    let channel = existing
    let created = false
    if (!channel) {
      const name = others.map((u) => u.name).join(', ')
      channel = await db.channel.create({
        data: {
          orgId: me.orgId,
          name,
          slug,
          kind,
          createdBy: me.id,
          members: { create: allIds.map((userId) => ({ userId, role: 'member' })) },
        },
        include: { members: { include: { user: true } } },
      })
      created = true
    }

    const dto = serializeChannel(channel, me, {
      memberCount: channel.members.length,
      isMember: true,
      unread: 0,
      mentionCount: 0,
      membership: channel.members.find((m) => m.userId === me.id) ?? null,
      lastMessage: null,
      members: others,
    })
    return { channel: dto, created }
  })
}

export const dynamic = 'force-dynamic'
