import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { serializeWorkflow } from '@/lib/workflows/serialize'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const stepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['post_message', 'send_dm', 'add_reaction', 'run_agent']),
  label: z.string().max(200).optional(),
  config: z
    .object({
      channelId: z.string().optional(),
      body: z.string().max(8000).optional(),
      userId: z.string().optional(),
      emoji: z.string().max(32).optional(),
      agentId: z.string().optional(),
      prompt: z.string().max(8000).optional(),
      targetTriggerMessage: z.boolean().optional(),
    })
    .default({}),
  condition: z.object({ keyword: z.string().max(200).optional() }).optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  triggerType: z.enum(['button', 'reaction', 'message_posted', 'webhook']).optional(),
  triggerConfig: z
    .object({
      channelId: z.string().optional(),
      emoji: z.string().max(32).optional(),
      keyword: z.string().max(200).optional(),
    })
    .optional(),
  steps: z.array(stepSchema).max(10).optional(),
})

// ─── PATCH: update a workflow (admin) ────────────────────────────────────────

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid workflow payload')
    }
    const { name, description, enabled, triggerType, triggerConfig, steps } = parsed.data

    const existing = await db.workflow.findFirst({ where: { id, orgId: me.orgId } })
    if (!existing) throw new HttpError(404, 'Workflow not found')

    const workflow = await db.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(triggerType !== undefined ? { triggerType } : {}),
        ...(triggerConfig !== undefined ? { triggerConfig: JSON.stringify(triggerConfig) } : {}),
        ...(steps !== undefined ? { steps: JSON.stringify(steps) } : {}),
      },
    })
    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'workflow.updated',
      target: workflow.name,
      meta: { fields: Object.keys(parsed.data) },
    })
    return { workflow: serializeWorkflow(workflow) }
  })
}

// ─── DELETE: remove a workflow (admin) ───────────────────────────────────────

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params
    const existing = await db.workflow.findFirst({ where: { id, orgId: me.orgId } })
    if (!existing) throw new HttpError(404, 'Workflow not found')

    await db.workflow.delete({ where: { id } })
    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'workflow.deleted',
      target: existing.name,
    })
    return { ok: true }
  })
}
