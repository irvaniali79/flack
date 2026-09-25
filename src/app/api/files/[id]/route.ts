import { readFile, stat } from 'fs/promises'
import { db } from '@/lib/db'
import { handle, HttpError } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const file = await db.file.findUnique({ where: { id } })
    if (!file) throw new HttpError(404, 'File not found')

    let exists = false
    try {
      await stat(file.path)
      exists = true
    } catch {
      exists = false
    }
    if (!exists) throw new HttpError(404, 'File not found')

    const buffer = await readFile(file.path)
    const encodedName = encodeURIComponent(file.name)

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api] file serve error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
