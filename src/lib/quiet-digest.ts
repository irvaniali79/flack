// Server-side quiet-hours digest release — runs on the scheduler tick.
// When a user's quiet window has ended but they still have suppressed
// notifications, flip them back to normal (they become unread + badge again)
// and push a single digest event so the client can toast + refetch.
import { db } from '@/lib/db'
import { emitToUsers } from '@/lib/realtime-server'
import { isQuietHours } from '@/lib/dnd'

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
      select: { id: true, kind: true, dndEnabled: true, dndStart: true, dndEnd: true },
    })
    if (!user || user.kind !== 'human') continue

    // Only release when quiet hours are OVER for this user
    if (isQuietHours(user)) continue

    const updated = await db.notification.updateMany({
      where: { userId: user.id, suppressed: true },
      data: { suppressed: false },
    })
    if (updated.count > 0) {
      released += updated.count
      void emitToUsers([user.id], 'notification:digest', { count: updated.count }).catch(() => {})
    }
  }
  return released
}
