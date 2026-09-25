// AI agent runtime — invoked fire-and-forget by the message POST route after
// every new message. All work is defensive: runtime errors are caught and
// logged, never thrown (the caller does not await this in a user-facing path).
import { db } from '@/lib/db'
import { emitAgentTyping, emitToChannel } from '@/lib/realtime-server'
import { serializeMessage, type MessageFull } from '@/lib/serialize'
import { callLLM, type LLMMessage } from './llm'
import type { Agent, Channel, User } from '@prisma/client'

export interface AgentTriggerMessage {
  id: string
  channelId: string
  senderId: string | null
  body: string
  parentId: string | null
}

// Same include shape as the messages route so serializeMessage can be reused.
const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

const MAX_AGENTS_PER_MESSAGE = 2
const HISTORY_MESSAGES = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

interface AgentTarget {
  agent: Agent & { user: User }
  viaMention: boolean
}

/** `@handle` appears in the body (case-insensitive, handle-word boundary). */
function matchesMention(body: string, handle: string): boolean {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`@${escaped}(?![a-zA-Z0-9_-])`, 'i').test(body)
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** The agent's reply joins the triggering message's thread, if any. */
function replyParentId(target: AgentTarget, parentId: string | null): string | null {
  // DM-triggered replies are always top-level; mentions follow the thread.
  return target.viaMention ? parentId : null
}

async function postAsAgent(
  channelId: string,
  senderId: string,
  body: string,
  parentId: string | null,
): Promise<void> {
  try {
    const created = await db.message.create({
      data: { channelId, senderId, body, parentId },
      include: messageInclude,
    })
    void emitToChannel(channelId, 'message:new', { message: serializeMessage(created as MessageFull) })
  } catch (err) {
    console.error('[agents] failed to post agent message:', err)
  }
}

/** Recent conversation the agent is replying into, chronological. */
async function loadContext(channel: Channel, parentId: string | null): Promise<MessageFull[]> {
  if (parentId) {
    // Thread context: root + its replies (includes the triggering message)
    const [root, replies] = await Promise.all([
      db.message.findUnique({ where: { id: parentId }, include: messageInclude }),
      db.message.findMany({
        where: { channelId: channel.id, parentId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: messageInclude,
      }),
    ])
    const rows = [root, ...replies].filter((m) => m && !m.deletedAt)
    return rows as MessageFull[]
  }
  // Channel context: last N messages (includes the new one, newest)
  const recent = await db.message.findMany({
    where: { channelId: channel.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_MESSAGES,
    include: messageInclude,
  })
  return recent.filter((m) => !m.deletedAt).reverse() as MessageFull[]
}

async function invokeAgent(
  target: AgentTarget,
  message: AgentTriggerMessage,
  channel: Channel & { org: { name: string } },
): Promise<void> {
  const { agent, viaMention } = target
  const agentUserId = agent.userId
  const agentName = agent.user.name
  const isDm = channel.kind === 'dm'

  // Hourly rate limit on agent-authored messages
  const recentCount = await db.message.count({
    where: { senderId: agentUserId, createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) } },
  })
  if (recentCount >= agent.rateLimitPerHour) {
    console.warn(`[agents] @${agent.handle} hit its hourly limit (${recentCount}/${agent.rateLimitPerHour})`)
    await postAsAgent(
      channel.id,
      agentUserId,
      "I've hit my hourly limit — try again in a bit ⏳",
      replyParentId(target, message.parentId),
    )
    return
  }

  void emitAgentTyping(channel.id, agentName)
  try {
    const history = await loadContext(channel, message.parentId)

    const where = isDm
      ? `a private DM conversation`
      : `the channel #${channel.name}${channel.topic ? ` (topic: ${channel.topic})` : ''}`
    let system = `${agent.systemPrompt}\n\n` +
      `You are ${agentName} (@${agent.handle}), an AI teammate in the ${channel.org.name} team chat, in ${where}. ` +
      `Current time: ${new Date().toISOString()}. Recent conversation follows. ` +
      `Reply as ${agentName} — helpful, concise, Markdown OK. ` +
      `Do not invent facts about the team beyond the conversation.`
    if (isDm && !viaMention) {
      system += ' This is a private direct message conversation.'
    }

    const llmMessages: LLMMessage[] = [{ role: 'assistant', content: system }]
    for (const m of history) {
      llmMessages.push({
        role: m.senderId === agentUserId ? 'assistant' : 'user',
        content: m.sender ? `${m.sender.name}: ${m.body}` : m.body,
      })
    }

    const reply = await callLLM(llmMessages)

    const created = await db.message.create({
      data: {
        channelId: channel.id,
        senderId: agentUserId,
        body: reply,
        parentId: replyParentId(target, message.parentId),
      },
      include: messageInclude,
    })
    void emitToChannel(channel.id, 'message:new', { message: serializeMessage(created as MessageFull) })
    await db.agent.update({ where: { id: agent.id }, data: { invocations: { increment: 1 } } })
  } catch (err) {
    console.error(`[agents] LLM generation failed for @${agent.handle}:`, err)
    await postAsAgent(
      channel.id,
      agentUserId,
      '⚠️ I couldn\'t generate a response just now — please try again.',
      replyParentId(target, message.parentId),
    )
  } finally {
    void emitAgentTyping(channel.id, agentName, true)
  }
}

/**
 * Decide whether any AI agent should respond to a freshly created message and
 * generate the reply. Mention trigger: @handle in the body. DM trigger: the
 * other participant of a DM is a chatable agent. Never triggered by agents.
 */
export async function maybeInvokeAgents(message: AgentTriggerMessage): Promise<void> {
  try {
    // 1. Agents never trigger agents (also prevents self-trigger loops)
    if (!message.senderId) return
    const sender = await db.user.findUnique({
      where: { id: message.senderId },
      select: { kind: true },
    })
    if (!sender || sender.kind === 'agent') return

    // 2. Channel + members
    const channel = await db.channel.findUnique({
      where: { id: message.channelId },
      include: {
        org: { select: { name: true } },
        members: { include: { user: true } },
      },
    })
    if (!channel) return
    const isDm = channel.kind === 'dm'

    const agents = await db.agent.findMany({
      where: { orgId: channel.orgId, isActive: true, chatable: true },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    // 3a. Mention trigger (scope: DMs always allowed)
    const targets: AgentTarget[] = []
    for (const agent of agents) {
      if (!matchesMention(message.body, agent.handle)) continue
      if (!isDm) {
        const scope = parseJsonArray(agent.scopeChannelIds)
        if (scope.length > 0 && !scope.includes(channel.id)) continue
      }
      targets.push({ agent, viaMention: true })
    }

    // 3b. DM trigger: the other member is a chatable agent
    if (isDm) {
      const others = channel.members.filter((m) => m.userId !== message.senderId)
      if (others.length === 1) {
        const dmAgent = agents.find((a) => a.userId === others[0].userId)
        if (dmAgent && !targets.some((t) => t.agent.id === dmAgent.id)) {
          targets.push({ agent: dmAgent, viaMention: false })
        }
      }
    }

    // 4. Bound cost: at most 2 agents respond per message, sequentially so
    // their typing indicators don't clobber each other.
    for (const target of targets.slice(0, MAX_AGENTS_PER_MESSAGE)) {
      try {
        await invokeAgent(target, message, channel)
      } catch (err) {
        // invokeAgent handles its own error path — this is a safety net
        console.error(`[agents] invocation crashed for @${target.agent.handle}:`, err)
        try {
          void emitAgentTyping(channel.id, target.agent.user.name, true)
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    // Fire-and-forget: runtime errors must never bubble
    console.error('[agents] maybeInvokeAgents error:', err)
  }
}
