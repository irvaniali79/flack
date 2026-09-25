import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { loadChannelsForViewer } from '@/lib/channel-list'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeChannel } from '@/lib/serialize'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    return { channels: await loadChannelsForViewer(me) }
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(300).optional(),
  kind: z.enum(['public', 'private']),
  memberIds: z.array(z.string()).max(50).optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Invalid channel details')
    const { name, topic, kind, memberIds } = parsed.data

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    if (!slug) throw new HttpError(400, 'Channel name must contain letters or numbers')

    const existing = await db.channel.findFirst({ where: { orgId: me.orgId, slug } })
    if (existing) throw new HttpError(409, `A channel called #${slug} already exists`)

    const channel = await db.channel.create({
      data: {
        orgId: me.orgId,
        name: slug,
        slug,
        topic: topic || null,
        kind,
        createdBy: me.id,
        members: {
          create: [
            { userId: me.id, role: 'owner' },
            ...(memberIds ?? [])
              .filter((id) => id !== me.id)
              .map((userId) => ({ userId, role: 'member' as const })),
          ],
        },
      },
      include: {
        members: { include: { user: { include: { agent: { select: { handle: true } } } } } },
      },
    })

    // Tell everyone to refresh their channel list
    const userIds = await db.user.findMany({
      where: { orgId: me.orgId, isActive: true },
      select: { id: true },
    })
    void emitToUsers(
      userIds.map((u) => u.id),
      'channels:refresh',
      { channelId: channel.id },
    ).catch(() => {})

    const members = channel.members
    return serializeChannel(channel, me, {
      memberCount: members.length,
      isMember: true,
      unread: 0,
      mentionCount: 0,
      membership: members.find((m) => m.userId === me.id) ?? null,
      lastMessage: null,
    })
  })
}

export const dynamic = 'force-dynamic'
