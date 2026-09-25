import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()

    const form = await request.formData().catch(() => null)
    if (!form) throw new HttpError(400, 'Expected multipart/form-data upload')

    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'Missing "file" field')
    if (file.size === 0) throw new HttpError(400, 'File is empty')
    if (file.size > MAX_SIZE) throw new HttpError(413, 'File is larger than 25 MB')

    const original = file.name || 'upload'
    const sanitized = original.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file'
    const filename = `${randomUUID()}-${sanitized}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = path.join(UPLOAD_DIR, filename)
    await writeFile(filePath, buffer)

    const mimeType = file.type || 'application/octet-stream'
    const record = await db.file.create({
      data: {
        uploaderId: me.id,
        name: original,
        mimeType,
        size: file.size,
        path: filePath,
        ...(mimeType.startsWith('image/') ? {} : {}),
      },
    })

    return {
      file: {
        id: record.id,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        width: record.width,
        height: record.height,
      },
      url: `/api/files/${record.id}`,
    }
  })
}

export const dynamic = 'force-dynamic'
