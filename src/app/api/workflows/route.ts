import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin, requireUser } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { serializeWorkflow } from '@/lib/workflows/serialize'
import {
  computeNextRunAt,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  SCHEDULE_TIME_REGEX,
  validateScheduleConfig,
} from '@/lib/workflows/schedule'

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
  triggerType: z.enum(['button', 'reaction', 'message_posted', 'webhook', 'schedule']),
  triggerConfig: z
    .object({
      channelId: z.string().optional(),
      emoji: z.string().max(32).optional(),
      keyword: z.string().max(200).optional(),
      scheduleKind: z.enum(['interval', 'daily']).optional(),
      minutes: z
        .number()
        .int()
        .min(MIN_INTERVAL_MINUTES)
        .max(MAX_INTERVAL_MINUTES)
        .optional(),
      time: z.string().regex(SCHEDULE_TIME_REGEX, 'Time must be HH:MM (24h)').optional(),
    })
    .default({}),
  steps: z.array(stepSchema).max(10).default([]),
  enabled: z.boolean().optional(),
})

// Defensive fallback when a (somehow invalid) schedule config slips through —
// parks the first run 15 minutes out instead of storing no timer at all.
function nextRunAtOrFallback(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
): string | undefined {
  if (triggerType !== 'schedule') return undefined
  const next = computeNextRunAt(triggerConfig)
  return (next ?? new Date(Date.now() + 15 * 60_000)).toISOString()
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid workflow payload')
    }
    const { name, description, triggerType, triggerConfig, steps, enabled } = parsed.data

    const scheduleProblem = validateScheduleConfig(triggerType, triggerConfig)
    if (scheduleProblem) throw new HttpError(400, scheduleProblem)

    // Schedule workflows get their first nextRunAt at save time (server-managed;
    // any client-sent nextRunAt is stripped by the zod schema above).
    const storedConfig =
      triggerType === 'schedule'
        ? { ...triggerConfig, nextRunAt: nextRunAtOrFallback(triggerType, triggerConfig) }
        : triggerConfig

    const workflow = await db.workflow.create({
      data: {
        orgId: me.orgId,
        name,
        description: description ?? null,
        triggerType,
        triggerConfig: JSON.stringify(storedConfig),
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
