// Thread follow helpers — Slack-style semantics:
//   • Thread root authors auto-follow their own threads
//   • Replying in a thread auto-follows it
//   • Followers (humans, excluding the reply author) get a `thread_reply`
//     notification when a new reply lands
// Used by the REST message route, the MCP post_message tool and the follow
// API so every "face" of the platform behaves identically.
import { db } from '@/lib/db'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeNotification } from '@/lib/serialize'
import { isQuietHours } from '@/lib/dnd'

/** Idempotently mark a user as following a thread (skip when already present). */
export async function ensureThreadFollow(messageId: string, userId: string): Promise<void> {
  const existing = await db.threadFollow.findUnique({
    where: { messageId_userId: { messageId, userId } },
    select: { id: true },
  })
  if (!existing) {
    await db.threadFollow.create({ data: { messageId, userId } }).catch(() => {
      // Unique-constraint race — the follow already exists, which is fine.
    })
  }
}

export function channelLabelForNotification(kind: string, name: string): string {
  if (kind === 'dm') return 'a DM'
  if (kind === 'group_dm') return 'a group DM'
  return `#${name}`
}

/**
 * Notify thread followers about a new reply.
 * - Skips the reply author (you don't notify yourself)
 * - Skips users already notified via @mention for THIS reply (no double-dings)
 * - Humans only — agent users never receive notifications
 * - Quiet hours: notifications are still created (nothing is lost) but marked
 *   suppressed — no realtime ding; the digest release delivers them later
 */
export async function notifyThreadFollowers(args: {
  reply: { id: string; parentId: string; channelId: string }
  actor: { id: string; name: string }
  channel: { id: string; name: string; kind: string }
  alreadyNotifiedUserIds?: Set<string>
}): Promise<void> {
  const { reply, actor, channel, alreadyNotifiedUserIds } = args

  const follows = await db.threadFollow.findMany({
    where: { messageId: reply.parentId },
    include: {
      user: { select: { id: true, kind: true, dndEnabled: true, dndStart: true, dndEnd: true } },
    },
  })

  const targets = follows.filter(
    (f) =>
      f.user.kind === 'human' &&
      f.userId !== actor.id &&
      !alreadyNotifiedUserIds?.has(f.userId),
  )
  if (targets.length === 0) return

  const where = channelLabelForNotification(channel.kind, channel.name)
  const body = `${actor.name} replied in a thread in ${where}`

  await db.notification.createMany({
    data: targets.map((f) => ({
      userId: f.userId,
      type: 'thread_reply',
      channelId: channel.id,
      messageId: reply.id,
      actorId: actor.id,
      body,
      suppressed: isQuietHours(f.user),
    })),
  })

  // Realtime ding per user (best effort) — only for those NOT in quiet hours
  for (const f of targets) {
    if (isQuietHours(f.user)) continue
    const dto = serializeNotification({
      id: 'latest',
      userId: f.userId,
      type: 'thread_reply',
      channelId: channel.id,
      messageId: reply.id,
      actorId: actor.id,
      body,
      readAt: null,
      suppressed: false,
      snoozedUntil: null,
      createdAt: new Date(),
      channel: { name: channel.name },
      actor: { name: actor.name },
    })
    void emitToUsers([f.userId], 'notification:new', dto).catch(() => {})
  }
}
