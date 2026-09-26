// Server-side quiet-hours digest release — runs on the scheduler tick.
// When a user's quiet window has ended but they still have suppressed
// notifications, flip them back to normal (they become unread + badge again)
// and push a single digest event so the client can toast + refetch.
// Users with emailNotif = "digest" additionally get the same digest through
// the mail adapter (outbox row in the sandbox, SMTP in production).
import { db } from '@/lib/db'
import { emitToUsers } from '@/lib/realtime-server'
import { isQuietHours } from '@/lib/dnd'
import { sendMail } from '@/lib/mail'

function digestSubject(count: number): string {
  return `While you were away — ${count} notification${count === 1 ? '' : 's'}`
}

/** Compose the plain-text email body from the released notification rows. */
function digestBody(
  userName: string,
  rows: { body: string; createdAt: Date; channelName: string | null; actorName: string | null }[],
): string {
  const lines = rows.map((r) => {
    const who = r.actorName ? `${r.actorName} — ` : ''
    const where = r.channelName ? `in #${r.channelName} ` : ''
    const when = r.createdAt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })
    return `• ${who}${where}(${when})\n  ${r.body}`
  })
  return (
    `Hi ${userName.split(' ')[0]},\n\n` +
    `Here's what happened in Flack Chat while your notifications were paused:\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `— Flack Chat (sent by the digest mailer at the end of your quiet hours)`
  )
}

export async function releaseQuietDigests(): Promise<number> {
  // Users with pending suppressed notifications (grouped) — small set in practice
  const pending = await db.notification.groupBy({
    by: ['userId'],
    where: { suppressed: true },
    _count: { _all: true },
  })
  if (pending.length === 0) return 0

  let released = 0
  for (const row of pending) {
    const user = await db.user.findUnique({
      where: { id: row.userId },
      select: {
        id: true,
        kind: true,
        orgId: true,
        name: true,
        email: true,
        emailNotif: true,
        dndEnabled: true,
        dndStart: true,
        dndEnd: true,
      },
    })
    if (!user || user.kind !== 'human') continue

    // Only release when quiet hours are OVER for this user
    if (isQuietHours(user)) continue

    // Snapshot what's about to be released (for the email body).
    // Notification rows only carry ids — join channel + actor names manually
    // (the model has no channel/actor relations by design).
    const wantsEmail = user.emailNotif === 'digest'
    let snapshot: { body: string; createdAt: Date; channelName: string | null; actorName: string | null }[] = []
    if (wantsEmail) {
      const rows = await db.notification.findMany({
        where: { userId: user.id, suppressed: true },
        orderBy: { createdAt: 'asc' },
        take: 25,
        select: { body: true, createdAt: true, channelId: true, actorId: true },
      })
      const channelIds = [...new Set(rows.map((r) => r.channelId).filter((v): v is string => !!v))]
      const actorIds = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))]
      const [channels, actors] = await Promise.all([
        channelIds.length
          ? db.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, name: true } })
          : Promise.resolve([] as { id: string; name: string }[]),
        actorIds.length
          ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
          : Promise.resolve([] as { id: string; name: string }[]),
      ])
      const channelNameById = new Map(channels.map((c) => [c.id, c.name]))
      const actorNameById = new Map(actors.map((a) => [a.id, a.name]))
      snapshot = rows.map((r) => ({
        body: r.body,
        createdAt: r.createdAt,
        channelName: r.channelId ? channelNameById.get(r.channelId) ?? null : null,
        actorName: r.actorId ? actorNameById.get(r.actorId) ?? null : null,
      }))
    }

    const updated = await db.notification.updateMany({
      where: { userId: user.id, suppressed: true },
      data: { suppressed: false },
    })
    if (updated.count > 0) {
      released += updated.count
      void emitToUsers([user.id], 'notification:digest', { count: updated.count }).catch(() => {})

      // Email digest through the adapter (outbox in sandbox, SMTP in prod)
      if (wantsEmail) {
        const rows = snapshot.length > 0 ? snapshot : [{ body: '…', createdAt: new Date(), channelName: null, actorName: null }]
        void sendMail({
          orgId: user.orgId,
          to: user.email,
          subject: digestSubject(updated.count),
          body: digestBody(user.name, rows),
          kind: 'quiet-digest',
        }).catch(() => {})
      }
    }
  }
  return released
}

/**
 * Release expired notification snoozes: rows whose snoozedUntil has passed
 * become visible again (badge + popover) — grouped per user so each client
 * gets one silent refresh event.
 */
export async function releaseSnoozedNotifications(): Promise<number> {
  const due = await db.notification.groupBy({
    by: ['userId'],
    where: { snoozedUntil: { not: null, lte: new Date() } },
    _count: { _all: true },
  })
  if (due.length === 0) return 0

  let released = 0
  for (const row of due) {
    const updated = await db.notification.updateMany({
      where: { userId: row.userId, snoozedUntil: { not: null, lte: new Date() } },
      data: { snoozedUntil: null },
    })
    if (updated.count > 0) {
      released += updated.count
      void emitToUsers([row.userId], 'notifications:refresh', {}).catch(() => {})
    }
  }
  return released
}
