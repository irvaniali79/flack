// Threads view data — every thread the user follows (Slack's "Threads" surface).
// Root authors and repliers auto-follow, so this is "threads I'm part of".
import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import type { ThreadCardDTO } from '@/lib/types'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()

    // Follow ids first (no include — orphaned follows whose root was hard-deleted
    // would throw on a required-relation include), then join in JS.
    const followRows = await db.threadFollow.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { messageId: true },
    })
    const followIds = [...new Set(followRows.map((f) => f.messageId))]
    const roots = followIds.length
      ? await db.message.findMany({
          where: { id: { in: followIds } },
          include: {
            sender: { select: { id: true, name: true, avatarColor: true, kind: true } },
            channel: { select: { id: true, name: true, slug: true, kind: true } },
            _count: { select: { replies: true } },
          },
        })
      : []
    const rootById = new Map(roots.map((r) => [r.id, r]))
    // Orphaned follows (root hard-deleted despite cascade — legacy data) drop out
    const rows = followIds
      .map((id) => rootById.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)

    // Access check: private/DM channels require current membership
    const channelIds = [...new Set(rows.map((m) => m.channelId))]
    const memberships = channelIds.length
      ? await db.channelMember.findMany({
          where: { channelId: { in: channelIds }, userId: me.id },
          select: { channelId: true },
        })
      : []
    const memberChannelIds = new Set(memberships.map((m) => m.channelId))
    const visible = rows.filter(
      (m) =>
        (m.channel.kind === 'public' || memberChannelIds.has(m.channelId)) &&
        // A thread needs at least one reply — a 0-reply root is just a message
        m._count.replies > 0,
    )

    // Latest replies per thread: participants, last activity (batched, not N+1)
    const rootIds = visible.map((m) => m.id)
    const replies = rootIds.length
      ? await db.message.findMany({
          where: { parentId: { in: rootIds }, deletedAt: null },
          include: {
            sender: { select: { id: true, name: true, avatarColor: true, kind: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : []
    const repliesByRoot = new Map<string, typeof replies>()
    for (const r of replies) {
      const list = repliesByRoot.get(r.parentId!) ?? []
      list.push(r)
      repliesByRoot.set(r.parentId!, list)
    }

    // Unread reply notifications per thread (thread_reply → reply → its root)
    const unreadNotifs = await db.notification.findMany({
      where: { userId: me.id, type: 'thread_reply', readAt: null, suppressed: false },
      select: { messageId: true },
    })
    const unreadReplyIds = unreadNotifs.map((n) => n.messageId).filter((v): v is string => !!v)
    const unreadRootIds = new Set<string>()
    if (unreadReplyIds.length > 0) {
      const replyRoots = await db.message.findMany({
        where: { id: { in: unreadReplyIds } },
        select: { id: true, parentId: true },
      })
      for (const r of replyRoots) if (r.parentId) unreadRootIds.add(r.parentId)
    }

    const cards: ThreadCardDTO[] = visible.map((root) => {
      const threadReplies = repliesByRoot.get(root.id) ?? []
      // Distinct participants (reply senders, newest first), up to 3 for avatars
      const seen = new Set<string>()
      const participants: ThreadCardDTO['participants'] = []
      for (const r of threadReplies) {
        if (!r.sender || seen.has(r.sender.id)) continue
        seen.add(r.sender.id)
        if (participants.length < 3) {
          participants.push({
            id: r.sender.id,
            name: r.sender.name,
            avatarColor: r.sender.avatarColor,
            kind: r.sender.kind === 'agent' ? 'agent' : 'human',
          })
        }
      }
      const participantCount = seen.size
      const lastReplyAt = threadReplies[0]?.createdAt ?? root.createdAt

      return {
        rootId: root.id,
        root: {
          id: root.id,
          body: root.deletedAt ? '' : root.body,
          createdAt: root.createdAt.toISOString(),
          senderName: root.sender?.name ?? null,
          senderColor: root.sender?.avatarColor ?? null,
          senderKind: root.sender
            ? ((root.sender.kind === 'agent' ? 'agent' : 'human') as 'human' | 'agent')
            : null,
        },
        channel: {
          id: root.channel.id,
          name: root.channel.name,
          slug: root.channel.slug,
          kind: root.channel.kind as ThreadCardDTO['channel']['kind'],
        },
        replyCount: root._count.replies,
        participants,
        participantCount,
        lastActivityAt: lastReplyAt.toISOString(),
        // Slack-style: bold + badge when there are unread replies
        unreadReplies: unreadRootIds.has(root.id) ? 1 : 0,
        following: true,
      }
    })

    cards.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))

    return { threads: cards }
  })
}

export const dynamic = 'force-dynamic'
