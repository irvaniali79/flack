// POST /api/admin/emoji — upload a custom emoji (admin only).
// multipart/form-data: file (image, ≤256 KB) + name (shortcode).
// DELETE lives in /api/admin/emoji/[id].
import { randomUUID } from 'crypto'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { lookup } from '@/lib/emoji'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'emoji')
const MAX_SIZE = 256 * 1024 // 256 KB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const NAME_RE = /^[a-z0-9][a-z0-9_]{1,31}$/

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()

    const form = await request.formData().catch(() => null)
    if (!form) throw new HttpError(400, 'Expected multipart/form-data with "file" and "name" fields')

    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'Missing "file" field')
    if (file.size === 0) throw new HttpError(400, 'File is empty')
    if (file.size > MAX_SIZE) throw new HttpError(413, 'Custom emoji must be ≤ 256 KB')

    const mimeType = file.type || ''
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new HttpError(400, `Unsupported type "${mimeType || 'unknown'}" — use PNG, JPG, GIF, WebP or SVG`)
    }

    const name = String(form.get('name') ?? '').trim().toLowerCase()
    if (!NAME_RE.test(name)) {
      throw new HttpError(400, 'Shortcode must be 2–32 chars: lowercase letters, digits, underscores (e.g. "ship_it")')
    }
    // don't shadow built-in shortcodes (:tada: etc. keep their unicode meaning)
    if (lookup(name)) {
      throw new HttpError(409, `:${name}: is a built-in shortcode — pick a different name`)
    }

    const clash = await db.customEmoji.findFirst({
      where: { orgId: me.orgId, name },
      select: { id: true },
    })
    if (clash) throw new HttpError(409, `:${name}: already exists — pick another shortcode`)

    const ext = mimeType === 'image/svg+xml' ? '.svg' : mimeType === 'image/png' ? '.png' : mimeType === 'image/gif' ? '.gif' : mimeType === 'image/webp' ? '.webp' : '.jpg'
    const filename = `${randomUUID()}${ext}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    const filePath = path.join(UPLOAD_DIR, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const record = await db.customEmoji.create({
      data: {
        orgId: me.orgId,
        name,
        path: filePath,
        mimeType,
        size: file.size,
        createdBy: me.id,
      },
    })

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'emoji.created',
      target: `:${name}:`,
      meta: { id: record.id, size: file.size, mimeType },
    })

    return {
      emoji: {
        id: record.id,
        name: record.name,
        url: `/api/emoji/${record.id}/image`,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt.toISOString(),
      },
    }
  })
}

// DELETE /api/admin/emoji?name=… — delete by name (row + file). The [id] route
// handles id-based deletes; this convenience path is used by the section UI.
export async function DELETE(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const name = new URL(request.url).searchParams.get('name')?.trim().toLowerCase()
    if (!name) throw new HttpError(400, 'Missing ?name= shortcode')

    const record = await db.customEmoji.findFirst({ where: { orgId: me.orgId, name } })
    if (!record) throw new HttpError(404, `:${name}: does not exist`)

    await db.customEmoji.delete({ where: { id: record.id } })
    await unlink(record.path).catch(() => {})

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'emoji.deleted',
      target: `:${name}:`,
      meta: { id: record.id },
    })

    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
