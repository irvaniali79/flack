import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { runWorkflowNow } from '@/lib/workflows/runtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─── POST: manual "Run now" (any member) ─────────────────────────────────────
// Awaits only the creation of the run row; execution continues in background.

export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const workflow = await db.workflow.findFirst({ where: { id, orgId: me.orgId } })
    if (!workflow) throw new HttpError(404, 'Workflow not found')
    const runId = await runWorkflowNow(id, me)
    return { ok: true, runId }
  })
}
