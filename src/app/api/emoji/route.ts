// GET /api/emoji — list the workspace's custom emoji (any signed-in member).
// Used by the emoji picker, the markdown renderer and reaction rendering.
import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { parseAliases } from '@/lib/emoji-aliases'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const rows = await db.customEmoji.findMany({
      where: { orgId: me.orgId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, aliases: true, mimeType: true, size: true, createdAt: true },
    })
    return {
      emoji: rows.map((e) => ({
        id: e.id,
        name: e.name,
        aliases: parseAliases(e.aliases),
        url: `/api/emoji/${e.id}/image`,
        mimeType: e.mimeType,
        size: e.size,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  })
}

export const dynamic = 'force-dynamic'
