import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { parseTriggerConfig, serializeWorkflow } from '@/lib/workflows/serialize'
import {
  computeNextRunAt,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  parseNextRunAt,
  SCHEDULE_TIME_REGEX,
  scheduleParamsChanged,
  validateScheduleConfig,
} from '@/lib/workflows/schedule'
import type { WorkflowTriggerConfig } from '@/lib/types'

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
  triggerType: z.enum(['button', 'reaction', 'message_posted', 'webhook', 'schedule']).optional(),
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
    .optional(),
  steps: z.array(stepSchema).max(10).optional(),
})

/**
 * Resolve the stored triggerConfig for a PATCH touching a schedule workflow.
 * nextRunAt is server-managed (client-sent values are stripped by zod) and is
 * recomputed from NOW only when: the schedule params changed, the trigger
 * became a schedule, the workflow is being (re-)enabled, or the stored timer
 * is missing/invalid. Unrelated edits (name, steps, disabling) keep the timer.
 */
function resolveStoredTriggerConfig(
  existing: { triggerType: string; triggerConfig: string; enabled: boolean },
  nextTriggerType: string | undefined,
  incomingConfig: WorkflowTriggerConfig | undefined,
  nextEnabled: boolean | undefined,
): WorkflowTriggerConfig {
  const oldConfig = parseTriggerConfig(existing.triggerConfig)
  const nextType = nextTriggerType ?? existing.triggerType

  // Non-schedule result: pass through incoming or keep the stored config.
  if (nextType !== 'schedule') {
    return incomingConfig !== undefined ? incomingConfig : oldConfig
  }

  const effectiveConfig = incomingConfig !== undefined ? incomingConfig : oldConfig
  const paramsChanged =
    existing.triggerType !== 'schedule' || scheduleParamsChanged(oldConfig, effectiveConfig)
  const enabling = nextEnabled === true && !existing.enabled
  const timerValid = parseNextRunAt(oldConfig) !== null

  if (paramsChanged || enabling || !timerValid) {
    const next =
      computeNextRunAt(effectiveConfig)?.toISOString() ??
      new Date(Date.now() + 15 * 60_000).toISOString()
    return { ...effectiveConfig, nextRunAt: next }
  }
  return { ...effectiveConfig, nextRunAt: oldConfig.nextRunAt }
}

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

    // Validate the EFFECTIVE trigger (incoming triggerType over the stored one)
    // against the EFFECTIVE config (incoming over stored).
    const effectiveType = triggerType ?? existing.triggerType
    const effectiveConfig =
      triggerConfig !== undefined ? triggerConfig : parseTriggerConfig(existing.triggerConfig)
    const scheduleProblem = validateScheduleConfig(effectiveType, effectiveConfig)
    if (scheduleProblem) throw new HttpError(400, scheduleProblem)

    const storedConfig = resolveStoredTriggerConfig(existing, triggerType, triggerConfig, enabled)

    const workflow = await db.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(triggerType !== undefined ? { triggerType } : {}),
        ...(triggerConfig !== undefined || effectiveType === 'schedule'
          ? { triggerConfig: JSON.stringify(storedConfig) }
          : {}),
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
