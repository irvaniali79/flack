// POST /api/admin/slack-import — upload a Slack workspace-export ZIP and
// import channels + history into this workspace (admin only).
// GET  /api/admin/slack-import — recent import runs (audit log entries).
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { importSlackExport } from '@/lib/slack/import'

const MAX_ZIP_BYTES = 50 * 1024 * 1024 // 50 MB

export async function POST(request: NextRequest) {
  return handle(async () => {
    const me = await requireAdmin()

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new HttpError(400, 'Send the export as multipart/form-data with a "file" field')
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'file field is required')
    if (file.size === 0) throw new HttpError(400, 'The file is empty')
    if (file.size > MAX_ZIP_BYTES) throw new HttpError(413, 'Export too large (max 50 MB)')
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new HttpError(400, 'Expected a .zip Slack export file')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const summary = await importSlackExport({ id: me.id, orgId: me.orgId, name: me.name }, bytes)
    return { summary }
  })
}

export async function GET() {
  return handle(async () => {
    await requireAdmin()
    const runs = await db.auditLog.findMany({
      where: { action: 'slack.import' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, actorId: true, createdAt: true, meta: true },
    })
    return {
      runs: runs.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        actor: r.actorId,
        summary: r.meta ? safeParse(r.meta) : null,
      })),
    }
  })
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300
