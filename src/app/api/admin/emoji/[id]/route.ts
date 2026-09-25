// DELETE /api/admin/emoji/[id] — remove a custom emoji (admin only):
// deletes the row and the image file on disk.
// PATCH  /api/admin/emoji/[id] — replace the alias list (emoji aliasing).
import { unlink } from 'fs/promises'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { lookup } from '@/lib/emoji'
import { parseAliases, validateAliasList } from '@/lib/emoji-aliases'

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params

    const record = await db.customEmoji.findFirst({ where: { id, orgId: me.orgId } })
    if (!record) throw new HttpError(404, 'Custom emoji not found')

    const body = (await request.json().catch(() => null)) as { aliases?: unknown } | null
    if (!body || !Array.isArray(body.aliases)) {
      throw new HttpError(400, 'Expected { aliases: string[] }')
    }

    const { ok, aliases, issues } = validateAliasList(body.aliases as string[])
    if (!ok) {
      throw new HttpError(400, issues.map((i) => (i.alias ? `:${i.alias}: — ${i.reason}` : i.reason)).join(' · '))
    }

    // No shadowing: built-in shortcodes win, and no two workspace emoji (names
    // or aliases) may claim the same shortcode.
    for (const alias of aliases) {
      if (lookup(alias)) {
        throw new HttpError(409, `:${alias}: is a built-in shortcode — pick a different alias`)
      }
      if (alias === record.name) {
        throw new HttpError(409, `:${alias}: is already this emoji's primary shortcode`)
      }
    }
    const siblings = await db.customEmoji.findMany({
      where: { orgId: me.orgId, id: { not: record.id } },
      select: { name: true, aliases: true },
    })
    const claimed = new Map<string, string>()
    for (const s of siblings) {
      claimed.set(s.name, s.name)
      for (const a of parseAliases(s.aliases)) claimed.set(a, s.name)
    }
    for (const alias of aliases) {
      const owner = claimed.get(alias)
      if (owner) {
        throw new HttpError(409, `:${alias}: is already used by :${owner}:`)
      }
    }

    await db.customEmoji.update({
      where: { id: record.id },
      data: { aliases: JSON.stringify(aliases) },
    })

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'emoji.aliases_updated',
      target: `:${record.name}:`,
      meta: { aliases },
    })

    return { id: record.id, name: record.name, aliases }
  })
}

export const dynamic = 'force-dynamic'
