import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { serializeWorkflowRun } from '@/lib/workflows/serialize'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─── GET: run history for a workflow, newest first ───────────────────────────

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const workflow = await db.workflow.findFirst({ where: { id, orgId: me.orgId } })
    if (!workflow) throw new HttpError(404, 'Workflow not found')

    const url = new URL(request.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 100)
    const runs = await db.workflowRun.findMany({
      where: { workflowId: id },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })
    return { runs: runs.map((run) => serializeWorkflowRun(run, workflow.name)) }
  })
}
