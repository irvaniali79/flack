// DELETE /api/admin/emoji/[id] — remove a custom emoji (admin only):
// deletes the row and the image file on disk.
import { unlink } from 'fs/promises'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params

    const record = await db.customEmoji.findFirst({ where: { id, orgId: me.orgId } })
    if (!record) throw new HttpError(404, 'Custom emoji not found')

    await db.customEmoji.delete({ where: { id: record.id } })
    await unlink(record.path).catch(() => {})

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'emoji.deleted',
      target: `:${record.name}:`,
      meta: { id: record.id },
    })

    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
