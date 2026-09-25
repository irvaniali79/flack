// Single source of truth for DB → DTO serialization. Keep in sync with src/lib/types.ts.
import type {
  Agent,
  Channel,
  ChannelMember,
  File as FileModel,
  Message,
  Notification,
  Reaction,
  User,
} from '@prisma/client'
import type {
  AgentDTO,
  ChannelDTO,
  FileDTO,
  MessageDTO,
  MessageMentions,
  NotificationDTO,
  ReactionDTO,
  UserDTO,
} from './types'

// ─── Users ───────────────────────────────────────────────────────────────────

type UserWithAgent = User & { agent?: { handle: string } | null }

export function serializeUser(user: UserWithAgent): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.kind === 'agent' ? undefined : user.email,
    title: user.title,
    avatarColor: user.avatarColor,
    kind: (user.kind === 'agent' ? 'agent' : 'human') as UserDTO['kind'],
    role: user.role as UserDTO['role'],
    statusEmoji: user.statusEmoji,
    statusText: user.statusText,
    dndEnabled: user.dndEnabled,
    dndStart: user.dndStart,
    dndEnd: user.dndEnd,
    totpEnabled: user.totpEnabled,
    emailNotif: (user.emailNotif === 'digest' ? 'digest' : 'off') as UserDTO['emailNotif'],
    isActive: user.isActive,
    handle: user.agent?.handle,
    timezone: user.timezone,
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

export type MessageFull = Message & {
  sender: UserWithAgent | null
  reactions: (Reaction & { user: User })[]
  files: FileModel[]
  _count?: { replies?: number } | null
}

function parseMentions(raw: string | null): MessageMentions {
  if (!raw) return { userIds: [], specials: [] }
  try {
    const parsed = JSON.parse(raw) as { userIds?: string[]; specials?: string[] }
    return {
      userIds: Array.isArray(parsed.userIds) ? parsed.userIds : [],
      specials: Array.isArray(parsed.specials) ? parsed.specials : [],
    }
  } catch {
    return { userIds: [], specials: [] }
  }
}

export function serializeMessage(message: MessageFull): MessageDTO {
  // Group reactions by emoji → ReactionDTO[]
  const byEmoji = new Map<string, ReactionDTO>()
  for (const reaction of message.reactions) {
    const entry = byEmoji.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      users: [],
      count: 0,
    }
    entry.users.push({ id: reaction.user.id, name: reaction.user.name })
    entry.count += 1
    byEmoji.set(reaction.emoji, entry)
  }
  return {
    id: message.id,
    channelId: message.channelId,
    sender: message.sender ? serializeUser(message.sender) : null,
    body: message.deletedAt ? '' : message.body,
    mentions: parseMentions(message.mentions),
    parentId: message.parentId,
    replyCount: message._count?.replies ?? 0,
    isPinned: message.isPinned,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    reactions: [...byEmoji.values()].sort((a, b) => b.count - a.count),
    files: message.deletedAt
      ? []
      : message.files.map((file): FileDTO => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          width: file.width,
          height: file.height,
        })),
  }
}

// ─── Channels ────────────────────────────────────────────────────────────────

export interface SerializeChannelOptions {
  memberCount: number
  isMember: boolean
  unread: number
  mentionCount: number
  membership: ChannelMember | null
  lastMessage: { body: string; createdAt: Date; senderName: string | null } | null
  members?: UserWithAgent[] // for DM/group channels: the OTHER members
}

export function serializeChannel(
  channel: Channel,
  viewer: User,
  opts: SerializeChannelOptions,
): ChannelDTO {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    topic: channel.topic,
    kind: channel.kind as ChannelDTO['kind'],
    isArchived: channel.isArchived,
    isDefault: channel.isDefault,
    memberCount: opts.memberCount,
    isMember: opts.isMember,
    unread: opts.unread,
    mentionCount: opts.mentionCount,
    muted: opts.membership?.muted ?? false,
    notifyLevel: ((opts.membership?.notifyLevel as ChannelDTO['notifyLevel']) ?? 'all'),
    members:
      opts.members && channel.kind !== 'public' && channel.kind !== 'private'
        ? opts.members.map(serializeUser)
        : undefined,
    lastMessage: opts.lastMessage
      ? {
          body: opts.lastMessage.body,
          createdAt: opts.lastMessage.createdAt.toISOString(),
          senderName: opts.lastMessage.senderName,
        }
      : null,
  }
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export type AgentFull = Agent & { user: UserWithAgent }

export function serializeAgent(agent: AgentFull): AgentDTO {
  return {
    id: agent.id,
    userId: agent.userId,
    handle: agent.handle,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    chatable: agent.chatable,
    isActive: agent.isActive,
    model: agent.model,
    rateLimitPerHour: agent.rateLimitPerHour,
    scopeChannelIds: agent.scopeChannelIds ? safeJsonArray(agent.scopeChannelIds) : [],
    tools: agent.tools ? safeJsonArray(agent.tools) : [],
    invocations: agent.invocations,
    user: serializeUser(agent.user),
  }
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationFull = Notification & {
  channel?: { name: string } | null
  actor?: { name: string } | null
}

export function serializeNotification(n: NotificationFull): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    channelId: n.channelId,
    channelName: n.channel?.name ?? null,
    messageId: n.messageId,
    body: n.body,
    actorName: n.actor?.name ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    suppressed: n.suppressed,
    snoozedUntil: n.snoozedUntil?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }
}
