import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { serializeNotification } from '@/lib/serialize'

export async function GET(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const url = new URL(request.url)
    const unreadOnly = url.searchParams.get('unread') === '1'

    const notifications = await db.notification.findMany({
      where: { userId: me.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    })

    // Notification rows only carry ids — join channel + actor names manually
    const channelIds = [...new Set(notifications.map((n) => n.channelId).filter((v): v is string => !!v))]
    const actorIds = [...new Set(notifications.map((n) => n.actorId).filter((v): v is string => !!v))]
    const [channels, actors] = await Promise.all([
      channelIds.length
        ? db.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      actorIds.length
        ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ])
    const channelNameById = new Map<string, string>(channels.map((c) => [c.id, c.name] as [string, string]))
    const actorNameById = new Map<string, string>(actors.map((a) => [a.id, a.name] as [string, string]))

    return {
      notifications: notifications.map((n) =>
        serializeNotification({
          ...n,
          channel: n.channelId ? { name: channelNameById.get(n.channelId) ?? '' } : null,
          actor: n.actorId ? { name: actorNameById.get(n.actorId) ?? '' } : null,
        }),
      ),
    }
  })
}

const schema = z.object({ ids: z.array(z.string()).max(100).optional() })

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new Error('Invalid payload')

    await db.notification.updateMany({
      where: {
        userId: me.id,
        readAt: null,
        ...(parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}),
      },
      data: { readAt: new Date() },
    })
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
