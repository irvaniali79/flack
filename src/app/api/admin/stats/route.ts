import { db } from '@/lib/db'
import { handle, requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── GET: workspace stats for the admin dashboard ────────────────────────────

export async function GET() {
  return handle(async () => {
    const me = await requireAdmin()

    const [
      users,
      activeUsers,
      channelCount,
      messagesToday,
      agentCount,
      workflowCount,
      files,
      fileAgg,
      recentMessages,
      topChannelsRaw,
      recentAuditRaw,
    ] = await Promise.all([
      db.user.count({ where: { orgId: me.orgId } }),
      db.user.count({ where: { orgId: me.orgId, isActive: true } }),
      // Named channels only (public/private) — DMs are not administered
      db.channel.count({ where: { orgId: me.orgId, kind: { in: ['public', 'private'] } } }),
      db.message.count({
        where: { createdAt: { gte: startOfDay(new Date()) }, channel: { orgId: me.orgId } },
      }),
      db.agent.count({ where: { orgId: me.orgId } }),
      db.workflow.count({ where: { orgId: me.orgId } }),
      db.file.count({ where: { uploader: { orgId: me.orgId } } }),
      db.file.aggregate({ where: { uploader: { orgId: me.orgId } }, _sum: { size: true } }),
      db.message.findMany({
        where: { channel: { orgId: me.orgId }, createdAt: { gte: daysAgo(13) } },
        select: { createdAt: true },
      }),
      db.channel.findMany({
        where: { orgId: me.orgId, kind: { in: ['public', 'private'] } },
        select: { id: true, name: true, kind: true, _count: { select: { messages: true } } },
      }),
      db.auditLog.findMany({
        where: { orgId: me.orgId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    // Messages per day for the last 14 days (inclusive of today)
    const days: { date: string; count: number }[] = []
    const today = startOfDay(new Date())
    for (let i = 13; i >= 0; i -= 1) {
      const day = new Date(today)
      day.setDate(day.getDate() - i)
      days.push({
        date: `${String(day.getMonth() + 1).padStart(2, '0')}/${String(day.getDate()).padStart(2, '0')}`,
        count: 0,
      })
    }
    for (const message of recentMessages) {
      const diffDays = Math.floor(
        (startOfDay(message.createdAt).getTime() - today.getTime()) / 86400000,
      )
      const index = 13 + diffDays
      if (index >= 0 && index < days.length) days[index].count += 1
    }

    const topChannels = topChannelsRaw
      .map((channel) => ({
        name: channel.name,
        kind: channel.kind,
        count: channel._count.messages,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // AuditLog stores actorId as a plain column — resolve names separately
    const actorIds = [...new Set(recentAuditRaw.map((entry) => entry.actorId).filter((id): id is string => !!id))]
    const actorUsers = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : []
    const actorNames = new Map<string, string>(actorUsers.map((u) => [u.id, u.name]))

    const recentAudit = recentAuditRaw.map((entry) => ({
      action: entry.action,
      target: entry.target,
      actorName: entry.actorId ? (actorNames.get(entry.actorId) ?? null) : null,
      at: entry.createdAt.toISOString(),
    }))

    return {
      users,
      activeUsers,
      channels: channelCount,
      messagesToday,
      agents: agentCount,
      workflows: workflowCount,
      files,
      storageBytes: fileAgg._sum.size ?? 0,
      messagesPerDay: days,
      topChannels,
      recentAudit,
    }
  })
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function daysAgo(n: number): Date {
  const date = startOfDay(new Date())
  date.setDate(date.getDate() - n)
  return date
}
