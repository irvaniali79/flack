// Tiny AuditLog writer shared by the workflow + admin APIs.
import { db } from '@/lib/db'

export function writeAudit(entry: {
  orgId: string
  actorId?: string | null
  action: string
  target?: string | null
  meta?: Record<string, unknown> | null
}): Promise<unknown> {
  return db.auditLog
    .create({
      data: {
        orgId: entry.orgId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    })
    .catch((err) => {
      console.error('[audit] write failed:', err)
    })
}
