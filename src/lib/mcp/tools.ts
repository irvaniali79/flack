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
import { slackEmojiToChar } from '@/lib/slack/compat'
import { notifyThreadFollowers } from '@/lib/threads'

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
  {
    name: 'get_thread',
    description:
      'Read one full thread: the root message plus all its replies, oldest first. Use the message id as thread_ts — ' +
      'it is the "ts" returned by post_message/read_channel/search_messages.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_ts: {
          type: 'string',
          description: 'Id of the thread root message.',
        },
      },
      required: ['thread_ts'],
    },
  },
  {
    name: 'add_reaction',
    description:
      'React to a message with an emoji. Accepts the emoji character ("👍") or a Slack-style shortcode ("thumbsup", ":tada:"). ' +
      'One reaction per user per emoji — reacting again with the same emoji removes it.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel the message is in: name ("general"), "#general", or channel id.',
        },
        ts: {
          type: 'string',
          description: 'Message id to react to.',
        },
        emoji: {
          type: 'string',
          description: 'Emoji character or shortcode, e.g. "👍", "thumbsup", ":tada:".',
        },
      },
      required: ['channel', 'ts', 'emoji'],
    },
  },
  {
    name: 'create_channel',
    description:
      'Create a new channel. The API key owner becomes the channel creator and first member. ' +
      'Names must be lowercase letters, numbers and hyphens (e.g. "release-notes").',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Channel name: lowercase letters, digits and hyphens, 1–40 chars.',
        },
        topic: {
          type: 'string',
          description: 'Optional channel topic / purpose.',
        },
        private: {
          type: 'boolean',
          description: 'Create a private channel instead of public (default false).',
        },
      },
      required: ['name'],
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

  // Thread follows: replying via MCP follows the thread too (same as the app)
  if (parentId) {
    await db.threadFollow
      .create({ data: { messageId: parentId, userId: actor.id } })
      .catch(() => {
        // Already following
      })
    await notifyThreadFollowers({
      reply: { id: message.id, parentId, channelId: channel.id },
      actor: { id: actor.id, name: actor.name },
      channel: { id: channel.id, name: channel.name, kind: channel.kind },
      alreadyNotifiedUserIds: notifyUserIds,
    }).catch(() => {})
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

// ─── Tool: get_thread ────────────────────────────────────────────────────────

export async function toolGetThread(
  actor: { id: string; orgId: string },
  args: { thread_ts: string },
): Promise<unknown> {
  const raw = (args.thread_ts ?? '').trim()
  if (!raw) throw new ToolError('thread_ts must not be empty')

  // Accept either the root id or any reply id (resolve to the root)
  const pivot = await db.message.findUnique({
    where: { id: raw },
    include: {
      channel: {
        include: { members: { where: { userId: actor.id }, select: { id: true } } },
      },
    },
  })
  if (!pivot || pivot.channel.orgId !== actor.orgId) throw new ToolError(`thread_ts "${raw}" not found`)
  if (pivot.channel.members.length === 0 && pivot.channel.kind !== 'public') {
    throw new ToolError(`The thread is in "${pivot.channel.name}" — the key owner is not a member`)
  }

  const rootId = pivot.parentId ?? pivot.id
  const [root, replies] = await Promise.all([
    db.message.findUnique({
      where: { id: rootId },
      include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
    }),
    db.message.findMany({
      where: { parentId: rootId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
    }),
  ])
  if (!root) throw new ToolError(`thread_ts "${raw}" not found`)

  const channelLabel =
    root.channel.kind === 'dm' || root.channel.kind === 'group_dm'
      ? root.channel.name
      : `#${root.channel.name}`

  return {
    ok: true,
    channel: channelLabel,
    thread_ts: root.id,
    reply_count: replies.length,
    root: compactMessage(root),
    replies: replies.map((m) => compactMessage(m)),
  }
}

// ─── Tool: add_reaction ──────────────────────────────────────────────────────

export async function toolAddReaction(
  actor: { id: string; orgId: string },
  args: { channel: string; ts: string; emoji: string },
): Promise<unknown> {
  const channel = await resolveChannel(actor.orgId, actor.id, args.channel)

  const emoji = slackEmojiToChar(String(args.emoji ?? ''))
  if (!emoji) throw new ToolError(`Unknown emoji "${args.emoji}" — try a raw emoji character or a shortcode like "thumbsup"`)

  const message = await db.message.findFirst({
    where: { id: String(args.ts ?? ''), channelId: channel.id },
    select: { id: true, deletedAt: true },
  })
  if (!message) throw new ToolError(`ts "${args.ts}" not found in #${channel.name}`)
  if (message.deletedAt) throw new ToolError('That message was deleted')

  const existing = await db.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId: message.id, userId: actor.id, emoji } },
  })
  if (existing) {
    await db.reaction.delete({ where: { id: existing.id } })
  } else {
    await db.reaction.create({ data: { messageId: message.id, userId: actor.id, emoji } })
  }

  const updated = await db.message.findUnique({
    where: { id: message.id },
    include: { ...messageInclude, channel: { select: { name: true, kind: true } } },
  })
  if (!updated) throw new ToolError('Message disappeared')

  const dto = serializeMessage(updated as MessageFull)
  void emitToChannel(updated.channelId, 'reaction:updated', {
    channelId: updated.channelId,
    messageId: updated.id,
    reactions: dto.reactions,
  }).catch(() => {})

  const mine = dto.reactions.find((r) => r.emoji === emoji)
  return {
    ok: true,
    channel: channel.kind === 'dm' || channel.kind === 'group_dm' ? channel.name : `#${channel.name}`,
    ts: updated.id,
    emoji,
    action: existing ? 'removed' : 'added',
    reactions: dto.reactions.map((r) => ({ emoji: r.emoji, count: r.count })),
    note: existing ? undefined : (mine ? `You and ${Math.max(0, mine.count - 1)} other${mine.count === 2 ? '' : 's'} reacted with ${emoji}` : undefined),
  }
}

// ─── Tool: create_channel ────────────────────────────────────────────────────

const CHANNEL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

export async function toolCreateChannel(
  actor: { id: string; orgId: string },
  args: { name: string; topic?: string; private?: boolean },
): Promise<unknown> {
  const name = String(args.name ?? '').trim().toLowerCase()
  if (!CHANNEL_NAME_RE.test(name)) {
    throw new ToolError('Channel name must be 1–40 chars of lowercase letters, digits and hyphens, starting with a letter or digit')
  }

  const existing = await db.channel.findFirst({
    where: { orgId: actor.orgId, slug: name },
    select: { id: true },
  })
  if (existing) throw new ToolError(`A channel called #${name} already exists`)

  const channel = await db.channel.create({
    data: {
      orgId: actor.orgId,
      name,
      slug: name,
      topic: args.topic ? String(args.topic).slice(0, 300) : null,
      kind: args.private ? 'private' : 'public',
      createdBy: actor.id,
      members: { create: { userId: actor.id, role: 'owner' } },
    },
    include: { _count: { select: { members: true, messages: true } } },
  })

  void emitToUsers([actor.id], 'channels:refresh', {}).catch(() => {})

  return {
    ok: true,
    channel: {
      id: channel.id,
      name: `#${channel.name}`,
      kind: channel.kind,
      topic: channel.topic ?? undefined,
      created_by: actor.id,
    },
  }
}
