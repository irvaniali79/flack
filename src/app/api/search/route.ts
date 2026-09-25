import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { loadChannelsForViewer } from '@/lib/channel-list'
import { serializeMessage, serializeUser } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

export async function GET(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()

    if (!q) return { messages: [], channels: [], users: [] }

    // Parse filter tokens out of q
    const tokens: string[] = []
    let fromFilter: string | null = null
    let inFilter: string | null = null
    let hasFile = false
    for (const part of q.split(/\s+/)) {
      const fromMatch = /^from:(.+)$/i.exec(part)
      const inMatch = /^in:(.+)$/i.exec(part)
      if (fromMatch) fromFilter = fromMatch[1].toLowerCase()
      else if (inMatch) inFilter = inMatch[1].toLowerCase()
      else if (/^has:file$/i.test(part)) hasFile = true
      else if (part) tokens.push(part)
    }
    const freeText = tokens.join(' ').toLowerCase()

    const myChannels = await loadChannelsForViewer(me)
    const memberChannels = myChannels.filter((c) => c.isMember)

    // Resolve `from:` to users (name contains)
    let fromUserIds: string[] | null = null
    if (fromFilter) {
      const users = await db.user.findMany({
        where: { orgId: me.orgId, name: { contains: fromFilter } },
        select: { id: true },
      })
      fromUserIds = users.map((u) => u.id)
      if (fromUserIds.length === 0) return { messages: [], channels: [], users: [] }
    }

    // Resolve `in:` to a channel (slug or name contains)
    let channelFilterIds: string[] | null = null
    if (inFilter) {
      const bare = inFilter.replace(/^#/, '').toLowerCase()
      const matched = memberChannels.filter(
        (c) => c.slug.includes(bare) || c.name.toLowerCase().includes(bare),
      )
      channelFilterIds = matched.map((c) => c.id)
      if (channelFilterIds.length === 0) return { messages: [], channels: [], users: [] }
    }

    const messages = await db.message.findMany({
      where: {
        deletedAt: null,
        channel: { orgId: me.orgId, members: { some: { userId: me.id } } },
        ...(channelFilterIds ? { channelId: { in: channelFilterIds } } : {}),
        ...(fromUserIds ? { senderId: { in: fromUserIds } } : {}),
        ...(hasFile ? { files: { some: {} } } : {}),
        ...(freeText ? { body: { contains: freeText } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      include: {
        sender: { include: { agent: { select: { handle: true } } } },
        reactions: { include: { user: true } },
        files: true,
        _count: { select: { replies: true } },
        channel: { select: { name: true, kind: true } },
      },
    })

    const channelNameById = new Map(memberChannels.map((c) => [c.id, c]))

    const users = freeText
      ? await db.user.findMany({
          where: { orgId: me.orgId, isActive: true, name: { contains: freeText } },
          take: 8,
          include: { agent: { select: { handle: true } } },
        })
      : []

    return {
      messages: messages
        .map((m) => {
          const dto = serializeMessage(m as MessageFull)
          const channel = channelNameById.get(m.channelId)
          return {
            ...dto,
            channelName: channel ? (channel.kind === 'dm' || channel.kind === 'group_dm' ? channel.name : `#${channel.name}`) : m.channel.name,
          }
        }),
      channels: freeText
        ? myChannels.filter(
            (c) =>
              (c.kind === 'public' || c.kind === 'private') &&
              (c.slug.includes(freeText) || c.name.toLowerCase().includes(freeText)),
          )
        : [],
      users: users.map(serializeUser),
    }
  })
}

export const dynamic = 'force-dynamic'
