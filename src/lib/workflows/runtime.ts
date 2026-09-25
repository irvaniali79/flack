// Workflow runtime — matches triggers and executes workflow steps.
// SERVER-ONLY (imports z-ai-web-dev-sdk). Called fire-and-forget from the
// message + reactions routes, and awaited up to run-row creation from the
// workflow / webhook APIs. Never lets errors bubble to its callers.
import { randomBytes } from 'crypto'
import type { Channel, Message, User, Workflow } from '@prisma/client'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'
import { emitAgentTyping, emitToChannel } from '@/lib/realtime-server'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'
import type { WorkflowRunLog, WorkflowStep } from '@/lib/types'

const BOT_EMAIL = 'workflows@acme.local'
const TRUNCATE_LABEL = 48

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

// ─── Trigger context ─────────────────────────────────────────────────────────

export interface WorkflowTriggerContext {
  triggerLabel: string
  message?: (Message & { channel: Channel; sender: User | null }) | null
  actor?: { id: string; name: string } | null
  actorId?: string | null
  emoji?: string | null
  webhook?: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function truncate(text: string, max = TRUNCATE_LABEL): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** Replace {{actor.name}} / {{channel.name}} / {{message.body}} / {{message.id}}. */
function renderTemplate(template: string, ctx: WorkflowTriggerContext): string {
  return template
    .replace(/\{\{\s*actor\.name\s*\}\}/g, () => ctx.actor?.name ?? ctx.message?.sender?.name ?? 'Someone')
    .replace(/\{\{\s*channel\.name\s*\}\}/g, () => ctx.message?.channel.name ?? 'the channel')
    .replace(/\{\{\s*message\.body\s*\}\}/g, () => ctx.message?.body ?? '')
    .replace(/\{\{\s*message\.id\s*\}\}/g, () => ctx.message?.id ?? '')
}

/** Find-or-create the "Workflows" bot user (kind agent, NO Agent record). */
let botUserCache: User | null = null

async function getBotUser(orgId: string): Promise<User> {
  if (botUserCache && botUserCache.orgId === orgId) return botUserCache
  const existing = await db.user.findUnique({ where: { email: BOT_EMAIL } })
  if (existing) {
    botUserCache = existing
    return existing
  }
  try {
    const created = await db.user.create({
      data: {
        orgId,
        email: BOT_EMAIL,
        name: 'Workflows',
        // Not a loginable account (not in salt:hash scrypt format)
        passwordHash: `!bot:${randomBytes(24).toString('hex')}`,
        kind: 'agent',
        role: 'member',
        title: 'Automation',
        avatarColor: '#059669',
      },
    })
    botUserCache = created
    return created
  } catch {
    // Lost a create race — re-fetch
    const raced = await db.user.findUnique({ where: { email: BOT_EMAIL } })
    if (raced) {
      botUserCache = raced
      return raced
    }
    throw new Error('Could not create the Workflows bot user')
  }
}

async function ensureChannelMember(channelId: string, userId: string): Promise<void> {
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  })
}

/** Find-or-create the DM channel between the bot and a user. */
async function findOrCreateDmChannel(bot: User, user: User): Promise<Channel> {
  const slug = `dm-${[bot.id, user.id].sort().join('-')}`
  const existing = await db.channel.findUnique({
    where: { orgId_slug: { orgId: user.orgId, slug } },
  })
  if (existing) return existing
  try {
    return await db.channel.create({
      data: {
        orgId: user.orgId,
        name: [bot.name, user.name].join(', '),
        slug,
        kind: 'dm',
        members: { create: [{ userId: bot.id }, { userId: user.id }] },
      },
    })
  } catch {
    const raced = await db.channel.findUnique({
      where: { orgId_slug: { orgId: user.orgId, slug } },
    })
    if (raced) return raced
    throw new Error('Could not create the DM channel')
  }
}

/** Create a message as `senderId` and broadcast it to the channel room. */
async function postMessageAs(channelId: string, senderId: string, body: string): Promise<void> {
  const message = await db.message.create({
    data: {
      channelId,
      senderId,
      body,
      mentions: JSON.stringify({ userIds: [], specials: [] }),
    },
    include: messageInclude,
  })
  const dto = serializeMessage(message as MessageFull)
  void emitToChannel(channelId, 'message:new', { message: dto }).catch(() => {})
}

// ─── Engine ──────────────────────────────────────────────────────────────────

const STEP_TYPE_LABELS: Record<string, string> = {
  post_message: 'Post a message',
  send_dm: 'Send a DM',
  add_reaction: 'Add a reaction',
  run_agent: 'Run an agent',
}

/**
 * Shared workflow engine. Creates the WorkflowRun row (status running),
 * increments the workflow run count, then executes the steps in the
 * background. Resolves as soon as the run row exists — callers that want
 * full completion can await nothing (all outcomes land in the run row).
 */
export async function runWorkflow(
  workflow: Workflow,
  ctx: WorkflowTriggerContext,
): Promise<string> {
  const run = await db.workflowRun.create({
    data: {
      workflowId: workflow.id,
      status: 'running',
      triggerLabel: ctx.triggerLabel,
      context: JSON.stringify({
        triggerLabel: ctx.triggerLabel,
        message: ctx.message
          ? {
              id: ctx.message.id,
              channelId: ctx.message.channelId,
              channelName: ctx.message.channel.name,
              body: ctx.message.body,
              senderName: ctx.message.sender?.name ?? null,
            }
          : null,
        actor: ctx.actor ?? null,
        actorId: ctx.actorId ?? null,
        emoji: ctx.emoji ?? null,
        webhook: ctx.webhook ?? null,
      }),
      logs: '[]',
    },
  })
  await db.workflow
    .update({ where: { id: workflow.id }, data: { runCount: { increment: 1 } } })
    .catch(() => {})
  // Execute in the background — never let errors escape to fire-and-forget callers.
  void executeRun(run.id, workflow, ctx).catch((err) => {
    console.error(`[workflows] run ${run.id} crashed:`, err)
  })
  return run.id
}

async function executeRun(
  runId: string,
  workflow: Workflow,
  ctx: WorkflowTriggerContext,
): Promise<void> {
  const logs: WorkflowRunLog[] = []
  const steps = safeParse<WorkflowStep[]>(workflow.steps, [])
  let failed = 0

  const pushLog = (
    step: string,
    label: string,
    status: WorkflowRunLog['status'],
    detail?: string,
  ) => {
    logs.push({ step, label, status, detail, at: nowIso() })
  }

  try {
    const bot = await getBotUser(workflow.orgId)

    if (steps.length === 0) {
      pushLog('workflow', workflow.name, 'skipped', 'No steps configured')
    }

    for (const step of steps) {
      const label = step.label?.trim() || STEP_TYPE_LABELS[step.type] || step.type
      try {
        // Optional per-step condition
        const keyword = step.condition?.keyword?.trim()
        if (keyword) {
          const body = ctx.message?.body ?? ''
          if (!body.toLowerCase().includes(keyword.toLowerCase())) {
            pushLog(step.type, label, 'skipped', `Condition not met — trigger message doesn't contain "${keyword}"`)
            continue
          }
        }

        switch (step.type) {
          case 'post_message': {
            const channelId = step.config.channelId || ctx.message?.channelId
            if (!channelId) throw new Error('No channel set for this step')
            const channel = await db.channel.findUnique({ where: { id: channelId } })
            if (!channel) throw new Error('Channel not found')
            const body = renderTemplate(step.config.body ?? '', ctx).trim()
            if (!body) throw new Error('Message body is empty')
            await ensureChannelMember(channel.id, bot.id)
            await postMessageAs(channel.id, bot.id, body)
            pushLog(step.type, label, 'ok', `Posted to #${channel.name}`)
            break
          }

          case 'send_dm': {
            const user = step.config.userId
              ? await db.user.findUnique({ where: { id: step.config.userId } })
              : null
            if (!user) throw new Error('Recipient not found')
            const body = renderTemplate(step.config.body ?? '', ctx).trim()
            if (!body) throw new Error('Message body is empty')
            const dm = await findOrCreateDmChannel(bot, user)
            await postMessageAs(dm.id, bot.id, body)
            pushLog(step.type, label, 'ok', `DM sent to ${user.name}`)
            break
          }

          case 'add_reaction': {
            if (!ctx.message) {
              pushLog(step.type, label, 'skipped', 'No trigger message')
              continue
            }
            const emoji = step.config.emoji?.trim()
            if (!emoji) throw new Error('No emoji set for this step')
            if (step.config.targetTriggerMessage !== false) {
              // De-dupe: replace the bot's existing reaction with the same emoji
              await db.reaction.deleteMany({
                where: { messageId: ctx.message.id, userId: bot.id, emoji },
              })
              await db.reaction.create({
                data: { messageId: ctx.message.id, userId: bot.id, emoji },
              })
              const updated = await db.message.findUnique({
                where: { id: ctx.message.id },
                include: { reactions: { include: { user: true } } },
              })
              if (updated) {
                const dto = serializeMessage({
                  ...updated,
                  sender: null,
                  files: [],
                  _count: { replies: 0 },
                } as MessageFull)
                void emitToChannel(updated.channelId, 'reaction:updated', {
                  channelId: updated.channelId,
                  messageId: updated.id,
                  reactions: dto.reactions,
                }).catch(() => {})
              }
              pushLog(step.type, label, 'ok', `Reacted ${emoji} on the trigger message`)
            } else {
              pushLog(step.type, label, 'skipped', 'Only the triggering message can be reacted to')
            }
            break
          }

          case 'run_agent': {
            const agent = step.config.agentId
              ? await db.agent.findUnique({
                  where: { id: step.config.agentId },
                  include: { user: true },
                })
              : null
            if (!agent) throw new Error('Agent not found')
            if (!agent.isActive) throw new Error(`Agent @${agent.handle} is disabled`)
            const channelId = step.config.channelId || ctx.message?.channelId
            if (!channelId) throw new Error('No channel set for this step')
            const channel = await db.channel.findUnique({ where: { id: channelId } })
            if (!channel) throw new Error('Channel not found')

            await db.agent
              .update({ where: { id: agent.id }, data: { invocations: { increment: 1 } } })
              .catch(() => {})
            await ensureChannelMember(channel.id, agent.userId)

            const prompt = renderTemplate(step.config.prompt ?? '', ctx).trim()
            const contextSummary = ctx.message
              ? `\n\n---\nTrigger context: a message in #${ctx.message.channel.name} by ${
                  ctx.message.sender?.name ?? 'someone'
                }:\n"${truncate(ctx.message.body, 400)}"`
              : ctx.webhook !== undefined
                ? '\n\n---\nTrigger context: an incoming webhook.'
                : ''
            void emitAgentTyping(channel.id, agent.user.name).catch(() => {})

            let reply = ''
            let llmFailed = false
            try {
              const zai = await ZAI.create()
              const completion = await zai.chat.completions.create({
                messages: [
                  { role: 'assistant', content: agent.systemPrompt },
                  { role: 'user', content: `${prompt}${contextSummary}` },
                ],
                thinking: { type: 'disabled' },
              })
              reply = completion.choices[0]?.message?.content?.trim() ?? ''
              if (!reply) throw new Error('Empty response')
            } catch (err) {
              llmFailed = true
              const reason = err instanceof Error ? err.message : 'unknown error'
              pushLog(step.type, label, 'failed', `LLM call failed (${reason}) — posted a fallback note`)
              reply = '⚠️ (workflow) I couldn’t generate a response.'
            }

            await postMessageAs(channel.id, agent.userId, reply)
            void emitAgentTyping(channel.id, agent.user.name, true).catch(() => {})
            if (!llmFailed) {
              pushLog(step.type, label, 'ok', `Agent @${agent.handle} replied in #${channel.name}`)
            }
            if (llmFailed) failed += 1
            break
          }

          default: {
            pushLog(step.type, label, 'failed', `Unknown step type "${step.type}"`)
            failed += 1
          }
        }
      } catch (err) {
        failed += 1
        pushLog(step.type, label, 'failed', err instanceof Error ? err.message : 'Step failed')
      }
      // Persist progress after each step so a crash still leaves a trail
      await db.workflowRun
        .update({ where: { id: runId }, data: { logs: JSON.stringify(logs) } })
        .catch(() => {})
    }

    const status = steps.length > 0 && failed === steps.length ? 'failed' : 'done'
    await db.workflowRun.update({
      where: { id: runId },
      data: { status, logs: JSON.stringify(logs), finishedAt: new Date() },
    })
  } catch (err) {
    // Engine-level unexpected throw — mark the run failed, never bubble up.
    const message = err instanceof Error ? err.message : 'Unexpected workflow error'
    pushLog('workflow', workflow.name, 'failed', message)
    await db.workflowRun
      .update({
        where: { id: runId },
        data: {
          status: 'failed',
          error: message,
          logs: JSON.stringify(logs),
          finishedAt: new Date(),
        },
      })
      .catch(() => {})
  }
}

// ─── Triggers ────────────────────────────────────────────────────────────────

/** Called fire-and-forget after a message is posted. */
export async function maybeTriggerWorkflowsOnMessage(message: {
  id: string
  channelId: string
  body: string
  senderId: string | null
}): Promise<void> {
  const workflows = await db.workflow.findMany({
    where: { enabled: true, triggerType: 'message_posted' },
  })
  if (workflows.length === 0) return

  const full = await db.message.findUnique({
    where: { id: message.id },
    include: { channel: true, sender: true },
  })
  if (!full) return
  // Loop guard: never trigger on the Workflows bot's own posts
  if (full.sender?.email === BOT_EMAIL) return

  for (const workflow of workflows) {
    try {
      const config = safeParse<{ channelId?: string; keyword?: string }>(workflow.triggerConfig, {})
      if (config.channelId && config.channelId !== message.channelId) continue
      if (
        config.keyword &&
        !message.body.toLowerCase().includes(config.keyword.toLowerCase())
      ) {
        continue
      }
      const actor = full.sender ? { id: full.sender.id, name: full.sender.name } : null
      await runWorkflow(workflow, {
        triggerLabel: `${full.sender?.name ?? 'Someone'} posted "${truncate(full.body)}" in #${full.channel.name}`,
        message: full,
        actor,
        actorId: message.senderId,
      })
    } catch (err) {
      console.error(`[workflows] message trigger failed for "${workflow.name}":`, err)
    }
  }
}

/** Called fire-and-forget after a reaction is toggled. */
export async function maybeTriggerWorkflowsOnReaction(
  messageId: string,
  emoji: string,
  actorId: string,
): Promise<void> {
  const workflows = await db.workflow.findMany({
    where: { enabled: true, triggerType: 'reaction' },
  })
  if (workflows.length === 0) return

  const message = await db.message.findUnique({
    where: { id: messageId },
    include: { channel: true, sender: true },
  })
  if (!message) return
  // Loop guard: ignore the Workflows bot's own reactions
  const actor = await db.user.findUnique({ where: { id: actorId } })
  if (actor?.email === BOT_EMAIL) return

  for (const workflow of workflows) {
    try {
      const config = safeParse<{ emoji?: string }>(workflow.triggerConfig, {})
      if (config.emoji && config.emoji !== emoji) continue
      await runWorkflow(workflow, {
        triggerLabel: `Reaction ${emoji} by ${actor?.name ?? 'Someone'}`,
        message,
        actor: actor ? { id: actor.id, name: actor.name } : null,
        actorId,
        emoji,
      })
    } catch (err) {
      console.error(`[workflows] reaction trigger failed for "${workflow.name}":`, err)
    }
  }
}

/** Manual run ("Run now" button). Awaits only the run row creation. */
export async function runWorkflowNow(workflowId: string, actorUser: User): Promise<string> {
  const workflow = await db.workflow.findUnique({ where: { id: workflowId } })
  if (!workflow) throw new HttpError(404, 'Workflow not found')
  return runWorkflow(workflow, {
    triggerLabel: `Manual run by ${actorUser.name}`,
    actor: { id: actorUser.id, name: actorUser.name },
    actorId: actorUser.id,
  })
}
