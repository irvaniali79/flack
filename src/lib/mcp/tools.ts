// MCP tool implementations for the Acme Chat MCP server.
// Every tool runs with the identity of the authenticated key owner (or the
// signed-in playground user) — agents and humans share the same API surface.
import { db } from '@/lib/db'
import { emitToChannel, emitToUsers } from '@/lib/realtime-server'
import { parseMentions } from '@/lib/mentions'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'
import { maybeInvokeAgents } from '@/lib/agents/runtime'
import { maybeTriggerWorkflowsOnMessage } from '@/lib/workflows/runtime'

export type McpTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ─── Tool catalog (MCP tools/list) ───────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'post_message',
    description:
      'Post a message to a channel. The message is attributed to the API key owner. ' +
      'Use @mentions (e.g. "@Aria can you check this?") to pull humans or AI agents into the conversation — ' +
      'mentioned agents will reply automatically. To reply in a thread, pass the thread_ts of the parent message.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel to post in: name ("general"), with hash ("#general"), or channel id.',
        },
        text: {
          type: 'string',
          description: 'Message text (mrkdwn-lite: **bold**, _italic_, `code`, lists). Max 8000 chars.',
        },
        thread_ts: {
          type: 'string',
          description: 'Optional id of the parent message to reply in a thread.',
        },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'read_channel',
    description:
      'Read recent messages from a channel (newest last). Top-level messages include reply counts; ' +
      'pass a thread_ts to read one thread instead. Private channels and DMs require membership.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name ("general"), "#general", or channel id.',
        },
        limit: {
          type: 'integer',
          description: 'Max messages to return (1–100, default 20).',
          minimum: 1,
          maximum: 100,
        },
        thread_ts: {
          type: 'string',
          description: 'Optional parent message id — return that thread’s replies instead.',
        },
      },
      required: ['channel'],
    },
  },
  {
    name: 'search_messages',
    description:
      'Search messages across the channels the key owner belongs to. Supports "from:name" and "in:#channel" filters. ' +
      'Returns the 10 most recent matches with author, channel and a text snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text. May include from:name and in:#channel filter tokens.',
        },
        count: {
          type: 'integer',
          description: 'Max results (1–30, default 10).',
          minimum: 1,
          maximum: 30,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_channels',
    description:
      'List channels visible to the key owner: channels they are a member of (with member/message counts) plus public channels.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// ─── Shared plumbing ─────────────────────────────────────────────────────────

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

export class ToolError extends Error {} // → MCP tool result with isError: true

async function resolveChannel(
  orgId: string,
  viewerId: string,
  reference: string,
): Promise<{ id: string; name: string; kind: string; isArchived: boolean }> {
  const bare = reference.trim().replace(/^#/, '').toLowerCase()
  const channel = await db.channel.findFirst({
    where: {
      orgId,
      OR: [{ id: reference }, { slug: bare }, { name: bare }],
    },
    select: { id: true, name: true, kind: true, isArchived: true, members: { where: { userId: viewerId } } },
  })
  if (!channel) throw new ToolError(`Channel "${reference}" not found`)
  const isMember = channel.members.length > 0
  if (!isMember && channel.kind !== 'public') {
    throw new ToolError(`"${reference}" is private — the key owner is not a member`)
  }
  return { id: channel.id, name: channel.name, kind: channel.kind, isArchived: channel.isArchived }
}

function compactMessage(m: MessageFull & { channel?: { name: string; kind: string } }) {
  const dto = serializeMessage(m)
  return {
    ts: dto.id,
    channel:
      m.channel && (m.channel.kind === 'dm' || m.channel.kind === 'group_dm')
        ? m.channel.name
        : m.channel
          ? `#${m.channel.name}`
          : undefined,
    user: dto.sender ? dto.sender.name : 'system',
    text: dto.body,
    thread_ts: dto.parentId ?? undefined,
    reply_count: dto.replyCount,
    reactions: dto.reactions.map((r) => `${r.emoji}(${r.count})`).join(' ') || undefined,
    ts_human: dto.createdAt,
  }
}

// ─── Tool: post_message ──────────────────────────────────────────────────────

export async function toolPostMessage(
  actor: { id: string; orgId: string; name: string },
  args: { channel: string; text: string; thread_ts?: string },
): Promise<unknown> {
  const text = (args.text ?? '').trim()
  if (!text) throw new ToolError('text must not be empty')
  if (text.length > 8000) throw new ToolError('text exceeds 8000 characters')

  const channel = await resolveChannel(actor.orgId, actor.id, args.channel)
  if (channel.isArchived) throw new ToolError(`#${channel.name} is archived`)

  // Thread parent must exist in this channel
  let parentId: string | null = null
  if (args.thread_ts) {
    const parent = await db.message.findFirst({
      where: { id: args.thread_ts, channelId: channel.id },
      select: { id: true },
    })
    if (!parent) throw new ToolError(`thread_ts "${args.thread_ts}" not found in #${channel.name}`)
    parentId = parent.id
  }

  const members = await db.channelMember.findMany({
    where: { channelId: channel.id },
    include: { user: { include: { agent: { select: { handle: true } } } } },
  })

  const mentions = parseMentions(
    text,
    members.map((m) => ({ id: m.user.id, name: m.user.name, handle: m.user.agent?.handle ?? null })),
  )

  const message = await db.message.create({
    data: {
      channelId: channel.id,
      senderId: actor.id,
      body: text,
      parentId,
      mentions: JSON.stringify(mentions),
    },
    include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
  })

  await db.channelMember.updateMany({
    where: { channelId: channel.id, userId: actor.id },
    data: { lastReadMessageId: message.id },
  })

  // Mention notifications — mirrors the REST message route
  const notifyUserIds = new Set<string>()
  for (const userId of mentions.userIds) {
    const member = members.find((m) => m.userId === userId)
    if (member && member.user.kind === 'human' && userId !== actor.id) notifyUserIds.add(userId)
  }
  if (mentions.specials.length > 0) {
    for (const m of members) {
      if (m.user.kind === 'human' && m.userId !== actor.id) notifyUserIds.add(m.userId)
    }
  }
  if (notifyUserIds.size > 0) {
    const where = channel.kind === 'dm' ? 'a DM' : channel.kind === 'group_dm' ? 'a group DM' : `#${channel.name}`
    await db.notification.createMany({
      data: [...notifyUserIds].map((userId) => ({
        userId,
        type: mentions.specials.length > 0 ? 'mention_special' : 'mention',
        channelId: channel.id,
        messageId: message.id,
        actorId: actor.id,
        body: `${actor.name} mentioned you in ${where}`,
      })),
    })
  }

  const dto = serializeMessage(message)
  void emitToChannel(channel.id, 'message:new', dto)
  if (notifyUserIds.size > 0) void emitToUsers([...notifyUserIds], 'notification:new', { count: notifyUserIds.size })

  // Same post-processing as human posts: agents may reply, workflows may fire
  void maybeInvokeAgents({ id: message.id, channelId: channel.id, senderId: actor.id, body: text, parentId })
  void maybeTriggerWorkflowsOnMessage({ id: message.id, channelId: channel.id, senderId: actor.id, body: text })

  return {
    ok: true,
    channel: channel.kind === 'dm' || channel.kind === 'group_dm' ? channel.name : `#${channel.name}`,
    ts: message.id,
    message: compactMessage(message),
  }
}

// ─── Tool: read_channel ──────────────────────────────────────────────────────

export async function toolReadChannel(
  actor: { id: string; orgId: string },
  args: { channel: string; limit?: number; thread_ts?: string },
): Promise<unknown> {
  const channel = await resolveChannel(actor.orgId, actor.id, args.channel)
  const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)

  const where = args.thread_ts
    ? { channelId: channel.id, parentId: args.thread_ts, deletedAt: null }
    : { channelId: channel.id, parentId: null, deletedAt: null }

  const messages = await db.message.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: args.thread_ts ? limit : limit,
    include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
  })

  const slice = args.thread_ts ? messages : messages.slice(-limit)
  return {
    ok: true,
    channel: channel.kind === 'dm' || channel.kind === 'group_dm' ? channel.name : `#${channel.name}`,
    count: slice.length,
    messages: slice.map((m) => compactMessage(m)),
  }
}

// ─── Tool: search_messages ───────────────────────────────────────────────────

export async function toolSearchMessages(
  actor: { id: string; orgId: string },
  args: { query: string; count?: number },
): Promise<unknown> {
  const count = Math.min(Math.max(Number(args.count ?? 10) || 10, 1), 30)
  const raw = (args.query ?? '').trim()
  if (!raw) throw new ToolError('query must not be empty')

  const tokens: string[] = []
  let fromFilter: string | null = null
  let inFilter: string | null = null
  for (const part of raw.split(/\s+/)) {
    const fromMatch = /^from:(.+)$/i.exec(part)
    const inMatch = /^in:(.+)$/i.exec(part)
    if (fromMatch) fromFilter = fromMatch[1].toLowerCase()
    else if (inMatch) inFilter = inMatch[1].toLowerCase()
    else if (part) tokens.push(part)
  }
  const freeText = tokens.join(' ').toLowerCase()

  const memberChannels = await db.channelMember.findMany({
    where: { userId: actor.id },
    select: { channelId: true },
  })
  const memberChannelIds = memberChannels.map((m) => m.channelId)
  if (memberChannelIds.length === 0) return { ok: true, query: raw, count: 0, messages: [] }

  let channelIds = memberChannelIds
  if (inFilter) {
    const bare = inFilter.replace(/^#/, '').toLowerCase()
    const matched = await db.channel.findMany({
      where: { orgId: actor.orgId, id: { in: memberChannelIds }, OR: [{ slug: bare }, { name: bare }] },
      select: { id: true },
    })
    if (matched.length === 0) return { ok: true, query: raw, count: 0, messages: [] }
    channelIds = matched.map((c) => c.id)
  }

  let fromUserIds: string[] | null = null
  if (fromFilter) {
    const users = await db.user.findMany({
      where: { orgId: actor.orgId, name: { contains: fromFilter } },
      select: { id: true },
    })
    fromUserIds = users.map((u) => u.id)
    if (fromUserIds.length === 0) return { ok: true, query: raw, count: 0, messages: [] }
  }

  const messages = await db.message.findMany({
    where: {
      deletedAt: null,
      channelId: { in: channelIds },
      ...(fromUserIds ? { senderId: { in: fromUserIds } } : {}),
      ...(freeText ? { body: { contains: freeText } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: count,
    include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
  })

  return {
    ok: true,
    query: raw,
    count: messages.length,
    messages: messages.map((m) => compactMessage(m)),
  }
}

// ─── Tool: list_channels ─────────────────────────────────────────────────────

export async function toolListChannels(actor: { id: string; orgId: string }): Promise<unknown> {
  const channels = await db.channel.findMany({
    where: {
      orgId: actor.orgId,
      isArchived: false,
      OR: [{ members: { some: { userId: actor.id } } }, { kind: 'public' }],
    },
    select: {
      id: true,
      name: true,
      kind: true,
      topic: true,
      members: { where: { userId: actor.id }, select: { lastReadMessageId: true } },
      _count: { select: { members: true, messages: true } },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })

  return {
    ok: true,
    channels: channels.map((c) => ({
      id: c.id,
      name: c.kind === 'public' || c.kind === 'private' ? `#${c.name}` : c.name,
      kind: c.kind,
      topic: c.topic ?? undefined,
      is_member: c.members.length > 0,
      member_count: c._count.members,
      message_count: c._count.messages,
    })),
  }
}
