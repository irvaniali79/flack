import { db } from '@/lib/db'
import { handle, HttpError } from '@/lib/auth'
import { runWorkflow } from '@/lib/workflows/runtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─── POST: external webhook trigger (NO auth by design) ──────────────────────
// The id in the path is the workflow id. The workflow must exist, be enabled
// and have triggerType === 'webhook'. The request body (any JSON) is stored
// on the run context.

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params
    const workflow = await db.workflow.findUnique({ where: { id } })
    if (!workflow) throw new HttpError(404, 'Workflow not found')
    if (!workflow.enabled) throw new HttpError(400, 'Workflow is disabled')
    if (workflow.triggerType !== 'webhook') {
      throw new HttpError(400, 'This workflow is not webhook-triggered')
    }

    let payload: unknown = null
    try {
      payload = await request.json()
    } catch {
      payload = null // empty or non-JSON body is fine
    }

    await runWorkflow(workflow, { triggerLabel: 'Webhook received', webhook: payload })
    return { ok: true, workflow: workflow.name }
  })
}
