// Snooze notifications: hide from the popover + badge until a chosen instant,
// then the scheduler tick releases them back as unread.
//   POST /api/notifications/snooze  { id } | { all: true }  + { minutes } | { until: ISO }
//   POST /api/notifications/snooze  { id, undo: true }      → un-snooze immediately
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

const schema = z
  .object({
    id: z.string().min(10).max(40).optional(),
    all: z.boolean().optional(),
    undo: z.boolean().optional(),
    minutes: z.number().int().min(1).max(60 * 24 * 7).optional(),
    until: z.string().datetime().optional(),
  })
  .refine((v) => v.id !== undefined || v.all === true, { message: 'Provide a notification id or all: true' })

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid snooze request')
    const { id, all, undo, minutes, until } = parsed.data

    // ── un-snooze: bring it back now ─────────────────────────────────────────
    if (undo) {
      if (!id) throw new HttpError(400, 'Undo needs a notification id')
      const updated = await db.notification.updateMany({
        where: { id, userId: me.id, snoozedUntil: { not: null } },
        data: { snoozedUntil: null },
      })
      if (updated.count === 0) throw new HttpError(404, 'Not a snoozed notification')
      return { snoozed: 0, unsnoozed: updated.count }
    }

    // ── snooze: compute the release instant (until | minutes | default 1h) ──
    let releaseAt: Date
    if (until) {
      releaseAt = new Date(until)
      if (Number.isNaN(releaseAt.getTime())) throw new HttpError(400, 'Invalid until timestamp')
    } else {
      releaseAt = new Date(Date.now() + (minutes ?? 60) * 60 * 1000)
    }
    if (releaseAt.getTime() <= Date.now()) throw new HttpError(400, 'Snooze must end in the future')

    const where = all
      ? { userId: me.id, snoozedUntil: null, suppressed: false, readAt: null }
      : { id, userId: me.id }
    const updated = await db.notification.updateMany({ where, data: { snoozedUntil: releaseAt } })
    if (updated.count === 0) throw new HttpError(404, 'Nothing to snooze')

    return { snoozed: updated.count, until: releaseAt.toISOString() }
  })
}

export const dynamic = 'force-dynamic'
