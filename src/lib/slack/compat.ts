// Slack Web API compatibility layer.
//
// Lets existing Slack bots and integrations (@slack/bolt, python slack_sdk,
// hubot, Zapier webhooks…) talk to an Acme Chat workspace by pointing
// SLACK_API_URL at `<origin>/api/slack/` and swapping the xoxb- token for an
// Acme API key (`acme_…`, created under Integrations).
//
// Conventions mirrored from Slack:
//   - Every response is HTTP 200 JSON with `{ ok: true, … }` or `{ ok: false, error }`.
//   - Params arrive as JSON body, form-encoded body, or query string.
//   - The token may be sent as `Authorization: Bearer …` or a `token` param.
//   - `ts` values are our message ids (opaque strings, like Slack's opaque ts).
//   - Channel `name` has no `#` prefix; `chat.postMessage` accepts id, name or #name.
import { db } from '@/lib/db'
import { emitToChannel, emitToUsers } from '@/lib/realtime-server'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'
import { EMOJI_CATEGORIES } from '@/lib/emoji'
import { toolPostMessage, toolSearchMessages, ToolError } from '@/lib/mcp/tools'
import { maybeTriggerWorkflowsOnReaction } from '@/lib/workflows/runtime'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class SlackError extends Error {
  code: string
  detail?: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
  }
}

// ─── Token handling ──────────────────────────────────────────────────────────

const ACME_PREFIX = 'acme_'
const XO_TOKEN = /^xox[a-z]-(.+)$/i

/** Normalizes a raw token: accepts `acme_…` directly, or `xoxb-acme_…` etc. */
export function normalizeSlackToken(raw: string): string {
  const trimmed = raw.trim()
  const xo = XO_TOKEN.exec(trimmed)
  const candidate = xo ? xo[1] : trimmed
  return candidate.startsWith(ACME_PREFIX) ? candidate : trimmed
}

// ─── mrkdwn → our markdown ───────────────────────────────────────────────────

/**
 * Converts Slack mrkdwn to our message format:
 *   <@U123> → @DisplayName (agents use @handle), <!channel>/<here> → @channel/@here,
 *   <https://x|label> → [label](https://x), *bold* → **bold**, ~strike~ → ~~strike~~.
 * Code spans/blocks are left untouched.
 */
export function slackTextToBody(
  text: string,
  usersById: Map<string, { name: string; handle?: string | null }>,
): string {
  const mention = (id: string) => {
    const user = usersById.get(id)
    if (!user) return `@${id}`
    if (user.handle) return `@${user.handle}`
    return `@${user.name.split(/\s+/)[0] ?? user.name}`
  }

  let out = ''
  let rest = text
  // Split out code spans/blocks so formatting conversion never touches them.
  while (rest.length > 0) {
    const fence = rest.indexOf('```')
    const tick = rest.indexOf('`')
    let cutAt = -1
    let closer = ''
    if (fence !== -1 && (tick === -1 || fence <= tick)) {
      cutAt = fence
      closer = '```'
    } else if (tick !== -1) {
      cutAt = tick
      closer = '`'
    } else {
      out += convertInline(rest, mention)
      break
    }
    out += convertInline(rest.slice(0, cutAt), mention)
    const end = rest.indexOf(closer, cutAt + closer.length)
    if (end === -1) {
      out += rest.slice(cutAt)
      break
    }
    out += rest.slice(cutAt, end + closer.length)
    rest = rest.slice(end + closer.length)
  }
  return out
}

function convertInline(text: string, mention: (id: string) => string): string {
  return text
    .replace(/<@([A-Za-z0-9_]+)(?:\|[^>]*)?>/g, (_, id: string) => mention(id))
    .replace(/<!(channel|here)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<((?:https?|mailto):\/\/[^<>|]+)\|([^<>|]+)>/g, '[$2]($1)')
    .replace(/<((?:https?|mailto):\/\/[^<>|]+)>/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1**$2**')
    .replace(/(^|[^~\w])~([^~\n]+)~(?!\w)/g, '$1~~$2~~')
}

// ─── Emoji name ↔ char maps (Slack reactions.add speaks shortcodes) ─────────

const CHAR_BY_NAME = new Map<string, string>()
const NAME_BY_CHAR = new Map<string, string>()
for (const category of EMOJI_CATEGORIES) {
  for (const emoji of category.emojis) {
    const name = emoji.keywords[0]
    if (!CHAR_BY_NAME.has(name)) CHAR_BY_NAME.set(name, emoji.char)
    if (!NAME_BY_CHAR.has(emoji.char)) NAME_BY_CHAR.set(emoji.char, name)
  }
}

/** `name` shortcode or raw emoji char → the emoji char we store on reactions. */
export function slackEmojiToChar(name: string): string | null {
  const trimmed = name.trim().replace(/^:|:$/g, '')
  if (!trimmed) return null
  if (CHAR_BY_NAME.has(trimmed)) return CHAR_BY_NAME.get(trimmed)!
  if (NAME_BY_CHAR.has(trimmed)) return trimmed // already a char
  return null
}

export function emojiCharToName(char: string): string {
  return NAME_BY_CHAR.get(char) ?? char
}

export function emojiListMap(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, char] of CHAR_BY_NAME) out[name] = char
  return out
}

// ─── Shared query helpers ────────────────────────────────────────────────────

export const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

export async function resolveChannelCompat(
  orgId: string,
  viewerId: string,
  reference: string,
  opts: { requireMember?: 'strict' | 'public-ok' } = {},
): Promise<{
  id: string
  name: string
  kind: string
  topic: string | null
  isArchived: boolean
  createdAt: Date
  isMember: boolean
  memberCount: number
}> {
  const bare = reference.trim().replace(/^#/, '').toLowerCase()
  const channel = await db.channel.findFirst({
    where: { orgId, OR: [{ id: reference }, { slug: bare }, { name: bare }] },
    select: {
      id: true, name: true, kind: true, topic: true, isArchived: true, createdAt: true,
      members: { select: { userId: true } },
      _count: { select: { members: true } },
    },
  })
  if (!channel) throw new SlackError('channel_not_found', `"${reference}" does not exist`)
  const isMember = channel.members.some((m) => m.userId === viewerId)
  if (!isMember && channel.kind !== 'public') {
    // Slack hides private channels from non-members — mirror that.
    throw new SlackError('channel_not_found', `"${reference}" is private or not visible to this token`)
  }
  if (opts.requireMember === 'strict' && !isMember) {
    throw new SlackError('not_in_channel', `"${reference}" — join the channel first`)
  }
  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    topic: channel.topic,
    isArchived: channel.isArchived,
    createdAt: channel.createdAt,
    isMember,
    memberCount: channel._count.members,
  }
}

// ─── Slack-shaped serializers ────────────────────────────────────────────────

export function slackChannel(
  c: {
    id: string
    name: string
    kind: string
    topic: string | null
    isArchived: boolean
    createdAt: Date
    memberCount: number
    isMember: boolean
  },
  extra?: Record<string, unknown>,
) {
  const isChannelType = c.kind === 'public' || c.kind === 'private'
  return {
    id: c.id,
    name: c.name,
    name_normalized: c.name,
    created: Math.floor(c.createdAt.getTime() / 1000),
    is_channel: isChannelType,
    is_group: c.kind === 'group_dm',
    is_im: c.kind === 'dm',
    is_private: c.kind !== 'public',
    is_archived: c.isArchived,
    is_member: c.isMember,
    is_shared: false,
    is_ext_shared: false,
    is_org_shared: false,
    num_members: c.memberCount,
    topic: { value: c.topic ?? '', creator: '', last_set: 0 },
    purpose: { value: c.topic ?? '', creator: '', last_set: 0 },
    ...extra,
  }
}

export function slackMessage(m: MessageFull & { channel?: { name: string } }) {
  const sender = m.sender
  const reactionGroups = new Map<string, { name: string; users: string[] }>()
  for (const r of m.reactions) {
    const entry = reactionGroups.get(r.emoji) ?? { name: emojiCharToName(r.emoji), users: [] }
    entry.users.push(r.userId)
    reactionGroups.set(r.emoji, entry)
  }
  return {
    type: 'message' as const,
    ts: m.id,
    thread_ts: m.parentId ?? undefined,
    user: sender && sender.kind === 'human' ? sender.id : undefined,
    bot_id: sender && sender.kind === 'agent' ? sender.id : undefined,
    username: sender?.name,
    text: m.body,
    reply_count: m._count?.replies ?? 0,
    reactions:
      reactionGroups.size > 0
        ? [...reactionGroups.values()].map((r) => ({ name: r.name, users: r.users, count: r.users.length }))
        : undefined,
    is_locked: false,
    edited: m.editedAt
      ? { user: m.senderId ?? undefined, ts: String(Math.floor(m.editedAt.getTime() / 1000)) }
      : undefined,
  }
}

export function slackMember(u: {
  id: string
  orgId: string
  name: string
  email: string
  title: string | null
  kind: string
  role: string
  isActive: boolean
  agent?: { handle: string } | null
}) {
  const firstName = (u.name.split(/\s+/)[0] ?? u.name).toLowerCase()
  return {
    id: u.id,
    team_id: u.orgId,
    name: firstName,
    real_name: u.name,
    deleted: !u.isActive,
    color: '',
    profile: {
      title: u.title ?? '',
      real_name: u.name,
      real_name_normalized: u.name,
      display_name: u.agent?.handle ? `@${u.agent.handle}` : firstName,
      display_name_normalized: u.agent?.handle ? `@${u.agent.handle}` : firstName,
      email: u.kind === 'human' ? u.email : undefined,
    },
    is_admin: u.role === 'owner' || u.role === 'admin',
    is_owner: u.role === 'owner',
    is_primary_owner: u.role === 'owner',
    is_restricted: false,
    is_ultra_restricted: false,
    is_bot: u.kind === 'agent',
    is_app_user: false,
    updated: Math.floor(Date.now() / 1000),
  }
}

// ─── Method implementations ──────────────────────────────────────────────────

export type SlackCtx = {
  user: { id: string; orgId: string; name: string; kind: string; role: string }
  org: { id: string; name: string }
  via: 'api_key' | 'session'
  keyPrefix?: string
  origin: string
}

export async function slackAuthTest(ctx: SlackCtx) {
  return {
    ok: true as const,
    url: `${ctx.origin}/`,
    team: ctx.org.name,
    team_id: ctx.org.id,
    user: ctx.user.name,
    user_id: ctx.user.id,
    bot_id: ctx.user.kind === 'agent' ? ctx.user.id : undefined,
    ...(ctx.via === 'api_key' ? { authed_user: { id: ctx.user.id, name: ctx.user.name } } : {}),
  }
}

export async function slackChatPostMessage(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const rawText = params.text ?? ''
  if (!rawText.trim()) throw new SlackError('no_text')
  if (rawText.length > 8000) throw new SlackError('msg_too_long')

  const users = await db.user.findMany({
    where: { orgId: ctx.org.id },
    select: { id: true, name: true, agent: { select: { handle: true } } },
  })
  const usersById = new Map(users.map((u) => [u.id, { name: u.name, handle: u.agent?.handle ?? null }]))
  const body = params.mrkdwn === 'false' ? rawText : slackTextToBody(rawText, usersById)

  try {
    const resolved = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
    const result = (await toolPostMessage(
      { id: ctx.user.id, orgId: ctx.org.id, name: ctx.user.name },
      { channel: params.channel ?? '', text: body, thread_ts: params.thread_ts || undefined },
    )) as { channel: string; ts: string; message: { text: string; thread_ts?: string } }
    return {
      ok: true as const,
      channel: resolved.id,
      ts: result.ts,
      message: {
        bot_id: ctx.user.id,
        type: 'message' as const,
        subtype: 'bot_message' as const,
        text: result.message.text,
        user: ctx.user.id,
        ts: result.ts,
        thread_ts: result.message.thread_ts,
      },
    }
  } catch (e) {
    if (e instanceof ToolError) {
      if (/not found in/.test(e.message)) throw new SlackError('thread_not_found', e.message)
      if (/is private/.test(e.message)) throw new SlackError('channel_not_found', e.message)
      if (/is archived/.test(e.message)) throw new SlackError('is_archived')
      if (/exceeds/.test(e.message)) throw new SlackError('msg_too_long')
      if (/not found/.test(e.message)) throw new SlackError('channel_not_found', e.message)
      throw new SlackError('invalid_request', e.message)
    }
    throw e
  }
}

export async function slackChatUpdate(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const message = await db.message.findFirst({
    where: { id: params.ts ?? '', channelId: channel.id },
    include: messageInclude,
  })
  if (!message || message.deletedAt) throw new SlackError('message_not_found')
  if (message.senderId !== ctx.user.id) {
    throw new SlackError('cant_update_message', 'you can only edit your own messages')
  }
  const text = params.text ?? ''
  if (!text.trim()) throw new SlackError('no_text')

  const users = await db.user.findMany({
    where: { orgId: ctx.org.id },
    select: { id: true, name: true, agent: { select: { handle: true } } },
  })
  const usersById = new Map(users.map((u) => [u.id, { name: u.name, handle: u.agent?.handle ?? null }]))
  const body = params.mrkdwn === 'false' ? text : slackTextToBody(text, usersById)

  const updated = await db.message.update({
    where: { id: message.id },
    data: { body, editedAt: new Date() },
    include: messageInclude,
  })
  void emitToChannel(updated.channelId, 'message:updated', {
    message: serializeMessage(updated as MessageFull),
  }).catch(() => {})

  return {
    ok: true as const,
    channel: channel.id,
    ts: updated.id,
    text: updated.body,
    message: slackMessage(updated as MessageFull),
  }
}

export async function slackChatDelete(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const message = await db.message.findFirst({
    where: { id: params.ts ?? '', channelId: channel.id },
  })
  if (!message || message.deletedAt) throw new SlackError('message_not_found')
  const isAdmin = ctx.user.role === 'owner' || ctx.user.role === 'admin'
  if (message.senderId !== ctx.user.id && !isAdmin) {
    throw new SlackError('cant_delete_message', 'you can only delete your own messages')
  }
  await db.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), isPinned: false },
  })
  void emitToChannel(message.channelId, 'message:deleted', {
    id: message.id,
    channelId: message.channelId,
  }).catch(() => {})
  return { ok: true as const, channel: channel.id, ts: message.id }
}

export async function slackConversationsList(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const types = (params.types || 'public_channel')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const kindFilter: string[] = []
  if (types.includes('public_channel')) kindFilter.push('public')
  if (types.includes('private_channel')) kindFilter.push('private')
  if (types.includes('im')) kindFilter.push('dm')
  if (types.includes('mpim')) kindFilter.push('group_dm')

  const channels = await db.channel.findMany({
    where: {
      orgId: ctx.org.id,
      isArchived: false,
      ...(kindFilter.length > 0 ? { kind: { in: kindFilter } } : {}),
      // DMs and private channels require membership; public channels are open.
      OR: [{ kind: 'public' }, { members: { some: { userId: ctx.user.id } } }],
    },
    select: {
      id: true, name: true, kind: true, topic: true, isArchived: true, createdAt: true,
      members: { where: { userId: ctx.user.id }, select: { userId: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
  return {
    ok: true as const,
    channels: channels.map((c) =>
      slackChannel(c, {
        is_member: c.members.length > 0,
        num_members: c._count.members,
      }),
    ),
    response_metadata: { next_cursor: '' },
  }
}

export async function slackConversationsInfo(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const c = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const channel = await db.channel.findUnique({
    where: { id: c.id },
    select: { members: { where: { userId: ctx.user.id } }, _count: { select: { members: true } } },
  })
  const full = {
    ...c,
    isMember: channel ? channel.members.length > 0 : false,
    memberCount: channel?._count.members ?? c.memberCount,
  }
  return { ok: true as const, channel: slackChannel(full) }
}

export async function slackConversationsHistory(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const limit = Math.min(Math.max(Number(params.limit ?? 100) || 100, 1), 200)
  const cursor = params.cursor?.trim() || undefined // exclusive: messages older than this id

  const messages = await db.message.findMany({
    where: {
      channelId: channel.id,
      parentId: null,
      deletedAt: null,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: messageInclude,
  })
  const hasMore = messages.length > limit
  const page = messages.slice(0, limit)
  return {
    ok: true as const,
    latest: page[0]?.id ?? (cursor ?? 'now'),
    messages: page.map((m) => slackMessage(m as MessageFull)),
    has_more: hasMore,
    is_limited: false,
    pin_count: 0,
    response_metadata: { next_cursor: hasMore && page.length > 0 ? page[page.length - 1].id : '' },
  }
}

export async function slackConversationsReplies(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const parent = await db.message.findFirst({
    where: { id: params.ts ?? '', channelId: channel.id, deletedAt: null },
    include: messageInclude,
  })
  if (!parent) throw new SlackError('thread_not_found')
  const limit = Math.min(Math.max(Number(params.limit ?? 100) || 100, 1), 200)

  const replies = await db.message.findMany({
    where: { channelId: channel.id, parentId: parent.id, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
    include: messageInclude,
  })
  return {
    ok: true as const,
    messages: [slackMessage(parent as MessageFull), ...replies.map((m) => slackMessage(m as MessageFull))],
    has_more: false,
    response_metadata: { next_cursor: '' },
  }
}

export async function slackConversationsJoin(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const reference = params.channel ?? ''
  const bare = reference.trim().replace(/^#/, '').toLowerCase()
  const channel = await db.channel.findFirst({
    where: { orgId: ctx.org.id, OR: [{ id: reference }, { slug: bare }, { name: bare }] },
    select: {
      id: true, name: true, kind: true, topic: true, isArchived: true, createdAt: true,
      members: { select: { userId: true } },
      _count: { select: { members: true } },
    },
  })
  if (!channel || (channel.kind !== 'public' && !channel.members.some((m) => m.userId === ctx.user.id))) {
    throw new SlackError('channel_not_found')
  }
  if (channel.isArchived) throw new SlackError('is_archived')

  const isMember = channel.members.some((m) => m.userId === ctx.user.id)
  if (!isMember) {
    await db.channelMember.create({ data: { channelId: channel.id, userId: ctx.user.id } })
    void emitToUsers([ctx.user.id], 'channels:refresh', { channelId: channel.id }).catch(() => {})
  }
  return {
    ok: true as const,
    channel: slackChannel(
      { ...channel, isMember: true, memberCount: channel._count.members + (isMember ? 0 : 1) },
      { last_read: '' },
    ),
    response_metadata: { next_cursor: '' },
  }
}

export async function slackConversationsOpen(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const ids = (params.users ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) throw new SlackError('user_not_found', 'users param is required')
  const others = await db.user.findMany({
    where: { id: { in: ids }, orgId: ctx.org.id, isActive: true },
  })
  if (others.length !== new Set(ids).size) throw new SlackError('user_not_found')
  const otherIds = [...new Set(ids)].filter((id) => id !== ctx.user.id)
  if (otherIds.length === 0) throw new SlackError('user_not_found', 'cannot open a DM with yourself')

  const allIds = [ctx.user.id, ...otherIds].sort()
  const kind = otherIds.length === 1 ? 'dm' : 'group_dm'
  const slug = `${kind === 'dm' ? 'dm' : 'gdm'}-${allIds.join('-')}`
  const existing = await db.channel.findFirst({ where: { orgId: ctx.org.id, slug } })
  let channel = existing
  let created = false
  if (!channel) {
    const targetNames = others
      .filter((u) => otherIds.includes(u.id))
      .sort((a, b) => otherIds.indexOf(a.id) - otherIds.indexOf(b.id))
      .map((u) => u.name)
      .join(', ')
    channel = await db.channel.create({
      data: {
        orgId: ctx.org.id,
        name: targetNames,
        slug,
        kind,
        createdBy: ctx.user.id,
        members: { create: allIds.map((userId) => ({ userId })) },
      },
    })
    created = true
    void emitToUsers(allIds, 'channels:refresh', { channelId: channel.id }).catch(() => {})
  }
  return {
    ok: true as const,
    no_op: !created,
    already_open: !created,
    channel: {
      id: channel.id,
      created: Math.floor(channel.createdAt.getTime() / 1000),
      is_im: kind === 'dm',
      is_mpim: kind === 'group_dm',
      is_private: true,
      user: kind === 'dm' ? otherIds[0] : undefined,
    },
  }
}

export async function slackUsersList(ctx: SlackCtx) {
  const users = await db.user.findMany({
    where: { orgId: ctx.org.id },
    include: { agent: { select: { handle: true } } },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
  return {
    ok: true as const,
    members: users.map((u) =>
      slackMember({
        id: u.id, orgId: u.orgId, name: u.name, email: u.email, title: u.title,
        kind: u.kind, role: u.role, isActive: u.isActive, agent: u.agent,
      }),
    ),
    cache_ts: Math.floor(Date.now() / 1000),
    response_metadata: { next_cursor: '' },
  }
}

export async function slackUsersInfo(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const user = await db.user.findFirst({
    where: { id: params.user ?? '', orgId: ctx.org.id },
    include: { agent: { select: { handle: true } } },
  })
  if (!user) throw new SlackError('user_not_found')
  return {
    ok: true as const,
    user: slackMember({
      id: user.id, orgId: user.orgId, name: user.name, email: user.email, title: user.title,
      kind: user.kind, role: user.role, isActive: user.isActive, agent: user.agent,
    }),
  }
}

export async function slackReactionsAdd(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '', {
    requireMember: 'strict',
  })
  const message = await db.message.findFirst({
    where: { id: params.timestamp ?? params.ts ?? '', channelId: channel.id, deletedAt: null },
  })
  if (!message) throw new SlackError('message_not_found')
  const char = slackEmojiToChar(params.name ?? '')
  if (!char) throw new SlackError('invalid_name', `"${params.name}" is not a known emoji`)

  const existing = await db.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId: message.id, userId: ctx.user.id, emoji: char } },
  })
  if (existing) throw new SlackError('already_reacted')

  await db.reaction.create({ data: { messageId: message.id, userId: ctx.user.id, emoji: char } })
  const updated = await db.message.findUnique({ where: { id: message.id }, include: messageInclude })
  if (updated) {
    const dto = serializeMessage(updated as MessageFull)
    void emitToChannel(updated.channelId, 'reaction:updated', {
      channelId: updated.channelId,
      messageId: updated.id,
      reactions: dto.reactions,
    }).catch(() => {})
    void maybeTriggerWorkflowsOnReaction(updated.id, char, ctx.user.id).catch(() => {})
  }
  return { ok: true as const }
}

export async function slackSearchMessages(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const count = Math.min(Math.max(Number(params.count ?? 20) || 20, 1), 100)
  const query = (params.query ?? '').trim()
  if (!query) throw new SlackError('no_query')
  const result = (await toolSearchMessages(
    { id: ctx.user.id, orgId: ctx.org.id },
    { query, count },
  )) as { messages: Array<{ ts: string; channel: string; user: string; text: string }> }
  return {
    ok: true as const,
    query,
    messages: {
      total: result.messages.length,
      matches: result.messages.map((m) => ({
        channel_id: m.channel,
        channel: m.channel,
        team: ctx.org.name,
        ts: m.ts,
        user: m.user,
        username: m.user,
        name: m.user,
        text: m.text,
      })),
      paging: { count, total: result.messages.length, page: 1, pages: 1, per_page: count },
    },
  }
}

export async function slackGetPermalink(
  ctx: SlackCtx,
  params: Record<string, string>,
) {
  const channel = await resolveChannelCompat(ctx.org.id, ctx.user.id, params.channel ?? '')
  const message = await db.message.findFirst({
    where: { id: params.message_ts ?? params.ts ?? '', channelId: channel.id, deletedAt: null },
    select: { id: true },
  })
  if (!message) throw new SlackError('message_not_found')
  const bare = channel.kind === 'public' || channel.kind === 'private' ? channel.name : channel.id
  return { ok: true as const, permalink: `${ctx.origin}/#${bare}/p${message.id}` }
}
