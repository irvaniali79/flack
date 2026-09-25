// Shared channel-list query used by /api/bootstrap, /api/channels and /api/dms.
// Returns ChannelDTO[] for: all channels the viewer is a member of + all public
// non-archived channels, sorted: channels first (by name), then DMs (by activity).
import type { Channel, ChannelMember, Message, User } from '@prisma/client'
import { db } from './db'
import { serializeChannel, serializeUser } from './serialize'
import type { ChannelDTO } from './types'

export async function loadChannelsForViewer(viewer: User): Promise<ChannelDTO[]> {
  const channels: Channel[] = await db.channel.findMany({
    where: {
      orgId: viewer.orgId,
      OR: [{ members: { some: { userId: viewer.id } } }, { kind: 'public', isArchived: false }],
    },
  })
  if (channels.length === 0) return []

  const channelIds = channels.map((c) => c.id)

  const [memberships, allMembers, messages] = await Promise.all([
    db.channelMember.findMany({ where: { channelId: { in: channelIds }, userId: viewer.id } }),
    db.channelMember.findMany({
      where: { channelId: { in: channelIds } },
      include: { user: { include: { agent: { select: { handle: true } } } } },
    }),
    db.message.findMany({
      where: { channelId: { in: channelIds }, deletedAt: null },
      select: {
        id: true,
        channelId: true,
        createdAt: true,
        senderId: true,
        mentions: true,
        body: true,
        sender: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const membershipByChannel = new Map(memberships.map((m) => [m.channelId, m]))
  const membersByChannel = new Map<string, typeof allMembers>()
  for (const m of allMembers) {
    const list = membersByChannel.get(m.channelId) ?? []
    list.push(m)
    membersByChannel.set(m.channelId, list)
  }
  const messagesByChannel = new Map<string, typeof messages>()
  for (const message of messages) {
    const list = messagesByChannel.get(message.channelId) ?? []
    list.push(message)
    messagesByChannel.set(message.channelId, list)
  }

  // lastRead timestamps: resolve my lastReadMessageId rows once
  const lastReadIds = [...new Set(memberships.map((m) => m.lastReadMessageId).filter((v): v is string => !!v))]
  const lastReadMessages: Pick<Message, 'id' | 'createdAt'>[] = lastReadIds.length
    ? await db.message.findMany({ where: { id: { in: lastReadIds } }, select: { id: true, createdAt: true } })
    : []
  const lastReadAtById = new Map(lastReadMessages.map((m) => [m.id, m.createdAt]))

  const dtos: ChannelDTO[] = channels.map((channel) => {
    const membership = membershipByChannel.get(channel.id) ?? null
    const members = membersByChannel.get(channel.id) ?? []
    const channelMessages = messagesByChannel.get(channel.id) ?? []

    // Unread: messages newer than my last-read (or join time), not sent by me
    let unread = 0
    let mentionCount = 0
    if (membership) {
      const threshold = membership.lastReadMessageId
        ? (lastReadAtById.get(membership.lastReadMessageId) ?? membership.joinedAt)
        : membership.joinedAt
      for (const message of channelMessages) {
        if (message.senderId === viewer.id) continue
        if (message.createdAt.getTime() > threshold.getTime()) {
          unread += 1
          if (
            (message.mentions && message.mentions.includes(`"${viewer.id}"`)) ||
            (message.mentions && (message.mentions.includes('@channel') || message.mentions.includes('@here')))
          ) {
            mentionCount += 1
          }
        }
      }
    }

    const last = channelMessages[channelMessages.length - 1] ?? null
    const lastMessage = last
      ? { body: last.body, createdAt: last.createdAt, senderName: last.sender?.name ?? null }
      : null

    const otherMembers =
      channel.kind === 'dm' || channel.kind === 'group_dm'
        ? members.filter((m) => m.userId !== viewer.id).map((m) => m.user)
        : undefined

    return serializeChannel(channel, viewer, {
      memberCount: members.length,
      isMember: !!membership,
      unread,
      mentionCount,
      membership,
      lastMessage,
      members: otherMembers,
    })
  })

  // Sort: channels (public/private) by name, then DMs by last activity desc
  const rank = (kind: string) => (kind === 'dm' || kind === 'group_dm' ? 1 : 0)
  return dtos.sort((a, b) => {
    const ra = rank(a.kind)
    const rb = rank(b.kind)
    if (ra !== rb) return ra - rb
    if (ra === 0) return a.name.localeCompare(b.name)
    const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0
    const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0
    if (ta !== tb) return tb - ta
    return a.name.localeCompare(b.name)
  })
}

/** Get a channel plus my membership, or null. */
export async function getChannelForUser(channelId: string, userId: string) {
  return db.channel.findFirst({
    where: { id: channelId },
    include: { members: { where: { userId } } },
  })
}

export { serializeUser }
