import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// ─── GET: named channels (public/private) with counts ────────────────────────

export async function GET() {
  return handle(async () => {
    const me = await requireAdmin()
    const channels = await db.channel.findMany({
      where: { orgId: me.orgId, kind: { in: ['public', 'private'] } },
      orderBy: [{ createdAt: 'asc' }],
      include: { _count: { select: { members: true, messages: true } } },
    })
    return {
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        topic: channel.topic,
        kind: channel.kind,
        isArchived: channel.isArchived,
        memberCount: channel._count.members,
        messageCount: channel._count.messages,
      })),
    }
  })
}

// ─── PATCH: archive/unarchive a channel ──────────────────────────────────────

const patchSchema = z.object({
  channelId: z.string().min(1),
  isArchived: z.boolean(),
})

export async function PATCH(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'channelId and isArchived are required')
    const { channelId, isArchived } = parsed.data

    const channel = await db.channel.findFirst({ where: { id: channelId, orgId: me.orgId } })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const updated = await db.channel.update({
      where: { id: channel.id },
      data: { isArchived },
    })
    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'channel.updated',
      target: `#${updated.name}`,
      meta: { isArchived },
    })
    return { channel: { id: updated.id, isArchived: updated.isArchived } }
  })
}

// ─── DELETE: hard-delete a channel (messages cascade) ────────────────────────

export async function DELETE(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    let channelId: string | undefined
    try {
      const body = (await request.json()) as { channelId?: unknown }
      if (typeof body?.channelId === 'string') channelId = body.channelId
    } catch {
      // fall through to query param
    }
    if (!channelId) {
      channelId = new URL(request.url).searchParams.get('channelId') ?? undefined
    }
    if (!channelId) throw new HttpError(400, 'channelId is required')

    const channel = await db.channel.findFirst({
      where: { id: channelId, orgId: me.orgId, kind: { in: ['public', 'private'] } },
      include: { _count: { select: { messages: true } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')

    await db.channel.delete({ where: { id: channel.id } })
    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'channel.deleted',
      target: `#${channel.name}`,
      meta: { deletedMessages: channel._count.messages },
    })
    return { ok: true }
  })
}
