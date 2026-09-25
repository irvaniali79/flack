import { randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, hashPassword, HttpError, requireAdmin, requireUser } from '@/lib/auth'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeAgent } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

// Warm palette only — no blue/indigo.
const AVATAR_COLORS = ['#c026d3', '#db2777', '#e11d48', '#ea580c', '#d97706', '#65a30d', '#dc2626', '#f59e0b']

const HANDLE_PATTERN = /^[a-z0-9_-]{2,24}$/

const agentsInclude = {
  user: {
    include: {
      agent: { select: { handle: true } },
      _count: { select: { messages: true } },
    },
  },
} as const

type AgentWithCount = Awaited<ReturnType<typeof db.agent.findFirst<{ include: typeof agentsInclude }>>>

function withMessageCount(agent: NonNullable<AgentWithCount>) {
  return { ...serializeAgent(agent), messageCount: agent.user._count.messages }
}

// ─── GET: all agents (management list) ───────────────────────────────────────

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const agents = await db.agent.findMany({
      where: { orgId: me.orgId },
      include: agentsInclude,
      orderBy: { createdAt: 'asc' },
    })
    return { agents: agents.map((agent) => withMessageCount(agent)) }
  })
}

// ─── POST: create an agent (admin) ───────────────────────────────────────────

const postSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z.string().trim().regex(HANDLE_PATTERN, 'Handle must be 2–24 chars: lowercase letters, digits, - or _'),
  description: z.string().trim().max(200).optional().nullable(),
  systemPrompt: z.string().trim().min(10, 'System prompt must be at least 10 characters').max(4000),
  chatable: z.boolean().optional(),
  model: z.enum(['glm-4', 'glm-4-air']).optional(),
  rateLimitPerHour: z.number().int().min(1).max(100).optional(),
  tools: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  scopeChannelIds: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const parsed = postSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid agent payload')
    }
    const data = parsed.data
    const agentHandle = data.handle

    // Uniqueness: agent handle + derived agent email
    const [handleTaken, emailTaken] = await Promise.all([
      db.agent.findUnique({ where: { handle: agentHandle }, select: { id: true } }),
      db.user.findUnique({ where: { email: `${agentHandle}@agent.local` }, select: { id: true } }),
    ])
    if (handleTaken || emailTaken) throw new HttpError(409, `@${agentHandle} is already taken`)

    // Data scope must reference real channels in this org
    const scope = data.scopeChannelIds?.length
      ? (
          await db.channel.findMany({
            where: { id: { in: data.scopeChannelIds }, orgId: me.orgId },
            select: { id: true },
          })
        ).map((c) => c.id)
      : []

    // Agent user
    const user = await db.user.create({
      data: {
        orgId: me.orgId,
        email: `${agentHandle}@agent.local`,
        name: data.name,
        passwordHash: hashPassword(randomBytes(24).toString('hex')),
        title: 'AI agent',
        kind: 'agent',
        role: 'member',
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      },
    })

    // Agent record
    const agent = await db.agent.create({
      data: {
        orgId: me.orgId,
        userId: user.id,
        handle: agentHandle,
        description: data.description || null,
        systemPrompt: data.systemPrompt,
        chatable: data.chatable ?? true,
        model: data.model ?? 'glm-4',
        rateLimitPerHour: data.rateLimitPerHour ?? 20,
        scopeChannelIds: scope.length > 0 ? JSON.stringify(scope) : null,
        tools: data.tools?.length ? JSON.stringify(data.tools) : null,
      },
      include: agentsInclude,
    })

    // Join the agent to every public, non-archived channel so it can be mentioned
    const publicChannels = await db.channel.findMany({
      where: { orgId: me.orgId, kind: 'public', isArchived: false },
      select: { id: true },
    })
    if (publicChannels.length > 0) {
      await db.channelMember.createMany({
        data: publicChannels.map((channel) => ({ channelId: channel.id, userId: user.id })),
      })
    }

    await db.auditLog.create({
      data: {
        orgId: me.orgId,
        actorId: me.id,
        action: 'agent.created',
        target: `@${agentHandle}`,
        meta: JSON.stringify({ name: data.name, handle: agentHandle, chatable: data.chatable ?? true }),
      },
    })

    // Membership counts changed for everyone → refresh channel lists
    const humans = await db.user.findMany({
      where: { orgId: me.orgId, kind: 'human', isActive: true },
      select: { id: true },
    })
    void emitToUsers(humans.map((h) => h.id), 'channels:refresh', {})

    return { agent: withMessageCount(agent) }
  })
}
