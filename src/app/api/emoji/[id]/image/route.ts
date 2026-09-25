// GET /api/emoji/[id]/image — serve a custom-emoji image (any signed-in
// member; long cache because emoji content is immutable per id).
import { db } from '@/lib/db'
import { HttpError, requireUser } from '@/lib/auth'
import { readFile } from 'fs/promises'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser()
    const { id } = await params

    const row = await db.customEmoji.findFirst({
      where: { id, orgId: me.orgId },
      select: { path: true, mimeType: true },
    })
    if (!row) throw new HttpError(404, 'Custom emoji not found')

    const data = await readFile(row.path).catch(() => null)
    if (!data) throw new HttpError(404, 'Custom emoji image is missing on disk')

    const ext = row.path.slice(row.path.lastIndexOf('.')).toLowerCase()
    const contentType = row.mimeType || MIME_BY_EXT[ext] || 'application/octet-stream'

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api] emoji image error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
