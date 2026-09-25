// Follow / unfollow a thread. Slack semantics: following a thread means new
// replies create a notification for you (you auto-follow threads you start or
// reply to; this endpoint is the manual override).
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ follow: z.boolean() })

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'follow (boolean) is required')
    const { follow } = parsed.data

    const message = await db.message.findUnique({
      where: { id },
      include: { channel: { include: { members: { where: { userId: me.id } } } } },
    })
    if (!message || message.channel.orgId !== me.orgId) throw new HttpError(404, 'Message not found')
    if (message.channel.members.length === 0 && message.channel.kind !== 'public') {
      throw new HttpError(403, 'You do not have access to this thread')
    }

    // Follows attach to the thread ROOT (a follow on a reply means its thread)
    const rootId = message.parentId ?? message.id

    if (follow) {
      await db.threadFollow
        .create({ data: { messageId: rootId, userId: me.id } })
        .catch(() => {
          // Already following — treat as success
        })
    } else {
      await db.threadFollow
        .deleteMany({ where: { messageId: rootId, userId: me.id } })
        .catch(() => {})
    }

    const followerCount = await db.threadFollow.count({ where: { messageId: rootId } })
    return { following: follow, followerCount, rootId }
  })
}

export const dynamic = 'force-dynamic'
