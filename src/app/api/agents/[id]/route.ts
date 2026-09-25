import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { serializeAgent } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const HANDLE_PATTERN = /^[a-z0-9_-]{2,24}$/

const agentsInclude = {
  user: {
    include: {
      agent: { select: { handle: true } },
      _count: { select: { messages: true } },
    },
  },
} as const

// ─── PATCH: update an agent (admin) ──────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  handle: z.string().trim().regex(HANDLE_PATTERN, 'Handle must be 2–24 chars: lowercase letters, digits, - or _').optional(),
  description: z.string().trim().max(200).nullable().optional(),
  systemPrompt: z.string().trim().min(10, 'System prompt must be at least 10 characters').max(4000).optional(),
  chatable: z.boolean().optional(),
  model: z.enum(['glm-4', 'glm-4-air']).optional(),
  rateLimitPerHour: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  tools: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  scopeChannelIds: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
})

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid agent payload')
    }
    const data = parsed.data

    const agent = await db.agent.findFirst({
      where: { id, orgId: me.orgId },
      include: agentsInclude,
    })
    if (!agent) throw new HttpError(404, 'Agent not found')

    const nextHandle = data.handle ?? agent.handle

    // Handle uniqueness (and the derived email) when it changes
    if (nextHandle !== agent.handle) {
      const [handleTaken, emailTaken] = await Promise.all([
        db.agent.findFirst({ where: { handle: nextHandle, id: { not: agent.id } }, select: { id: true } }),
        db.user.findFirst({ where: { email: `${nextHandle}@agent.local`, id: { not: agent.userId } }, select: { id: true } }),
      ])
      if (handleTaken || emailTaken) throw new HttpError(409, `@${nextHandle} is already taken`)
    }

    // Data scope must reference real channels in this org
    let scopeChannelIds: string | null = agent.scopeChannelIds
    if (data.scopeChannelIds) {
      const scope = data.scopeChannelIds.length
        ? (
            await db.channel.findMany({
              where: { id: { in: data.scopeChannelIds }, orgId: me.orgId },
              select: { id: true },
            })
          ).map((c) => c.id)
        : []
      scopeChannelIds = scope.length > 0 ? JSON.stringify(scope) : null
    }

    // Keep the underlying user record in sync FIRST (name, email-from-handle,
    // active) so the agent fetch below returns fresh user data.
    await db.user.update({
      where: { id: agent.userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(nextHandle !== agent.handle ? { email: `${nextHandle}@agent.local` } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    })

    const updated = await db.agent.update({
      where: { id: agent.id },
      data: {
        handle: nextHandle,
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.systemPrompt !== undefined ? { systemPrompt: data.systemPrompt } : {}),
        ...(data.chatable !== undefined ? { chatable: data.chatable } : {}),
        ...(data.model !== undefined ? { model: data.model } : {}),
        ...(data.rateLimitPerHour !== undefined ? { rateLimitPerHour: data.rateLimitPerHour } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.tools !== undefined ? { tools: data.tools.length ? JSON.stringify(data.tools) : null } : {}),
        ...(scopeChannelIds !== undefined ? { scopeChannelIds } : {}),
      },
      include: agentsInclude,
    })

    await db.auditLog.create({
      data: {
        orgId: me.orgId,
        actorId: me.id,
        action: 'agent.updated',
        target: `@${nextHandle}`,
        meta: JSON.stringify({ agentId: agent.id, fields: Object.keys(parsed.data) }),
      },
    })

    return {
      agent: {
        ...serializeAgent(updated),
        messageCount: updated.user._count.messages,
      },
    }
  })
}

// ─── DELETE: remove an agent (admin) ─────────────────────────────────────────
// Soft-disable when the agent has message history (keeps history coherent);
// hard-delete the agent + its user only when it never posted anything.

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params

    const agent = await db.agent.findFirst({
      where: { id, orgId: me.orgId },
      include: { user: { include: { _count: { select: { messages: true } } } } },
    })
    if (!agent) throw new HttpError(404, 'Agent not found')

    if (agent.user._count.messages === 0) {
      // Hard delete: cascades to the Agent row, memberships, sessions…
      await db.user.delete({ where: { id: agent.userId } })
      await db.auditLog.create({
        data: {
          orgId: me.orgId,
          actorId: me.id,
          action: 'agent.deleted',
          target: `@${agent.handle}`,
          meta: JSON.stringify({ agentId: agent.id, mode: 'hard' }),
        },
      })
      return { ok: true, deleted: true }
    }

    // Soft disable: keep the author rows intact for message history
    await db.agent.update({
      where: { id: agent.id },
      data: { isActive: false, chatable: false },
    })
    await db.user.update({
      where: { id: agent.userId },
      data: { isActive: false },
    })
    await db.auditLog.create({
      data: {
        orgId: me.orgId,
        actorId: me.id,
        action: 'agent.deleted',
        target: `@${agent.handle}`,
        meta: JSON.stringify({ agentId: agent.id, mode: 'soft', messages: agent.user._count.messages }),
      },
    })
    return { ok: true, disabled: true, messages: agent.user._count.messages }
  })
}
