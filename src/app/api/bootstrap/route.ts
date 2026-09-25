import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { loadChannelsForViewer } from '@/lib/channel-list'
import { serializeAgent, serializeUser } from '@/lib/serialize'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()

    const [org, users, channels, agents, unreadNotifications] = await Promise.all([
      db.org.findUnique({ where: { id: me.orgId }, select: { name: true } }),
      db.user.findMany({
        where: { orgId: me.orgId, isActive: true },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        include: { agent: { select: { handle: true } } },
      }),
      loadChannelsForViewer(me),
      db.agent.findMany({
        where: { orgId: me.orgId, isActive: true },
        include: { user: { include: { agent: { select: { handle: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.notification.count({ where: { userId: me.id, readAt: null, suppressed: false, snoozedUntil: null } }),
    ])

    return {
      me: serializeUser(me),
      org: { name: org?.name ?? 'Acme' },
      users: users.map(serializeUser),
      channels,
      agents: agents.map(serializeAgent),
      notificationsUnread: unreadNotifications,
    }
  })
}

export const dynamic = 'force-dynamic'
