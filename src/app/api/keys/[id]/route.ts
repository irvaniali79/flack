import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { serializeApiKey } from '@/lib/api-keys'
import { writeAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

// ─── DELETE: revoke one of my keys (soft revoke, kept for audit) ─────────────

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const record = await db.apiKey.findFirst({ where: { id, userId: me.id } })
    if (!record) throw new HttpError(404, 'API key not found')
    if (record.revokedAt) return { key: serializeApiKey(record) } // idempotent

    const updated = await db.apiKey.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    })

    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'api_key.revoke',
      target: record.keyPrefix,
      meta: { name: record.name },
    })

    return { key: serializeApiKey(updated) }
  })
}

export const dynamic = 'force-dynamic'
