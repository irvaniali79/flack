import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin, requireUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { serializeWorkflow } from '@/lib/workflows/serialize'

export const dynamic = 'force-dynamic'

// ─── GET: list workflows (any member) ────────────────────────────────────────

export async function GET() {
  return handle(async () => {
    await requireUser()
    const workflows = await db.workflow.findMany({
      orderBy: [{ createdAt: 'asc' }],
    })
    return { workflows: workflows.map(serializeWorkflow) }
  })
}

// ─── POST: create a workflow (admin) ─────────────────────────────────────────

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

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  triggerType: z.enum(['button', 'reaction', 'message_posted', 'webhook']),
  triggerConfig: z
    .object({
      channelId: z.string().optional(),
      emoji: z.string().max(32).optional(),
      keyword: z.string().max(200).optional(),
    })
    .default({}),
  steps: z.array(stepSchema).max(10).default([]),
  enabled: z.boolean().optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid workflow payload')
    }
    const { name, description, triggerType, triggerConfig, steps, enabled } = parsed.data

    const workflow = await db.workflow.create({
      data: {
        orgId: me.orgId,
        name,
        description: description ?? null,
        triggerType,
        triggerConfig: JSON.stringify(triggerConfig),
        steps: JSON.stringify(steps),
        enabled: enabled ?? true,
        createdBy: me.id,
      },
    })
    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'workflow.created',
      target: name,
      meta: { triggerType, steps: steps.length },
    })
    return { workflow: serializeWorkflow(workflow) }
  })
}
