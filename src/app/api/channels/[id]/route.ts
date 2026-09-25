import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeUser } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

async function broadcastRefresh(orgId: string) {
  try {
    const users = await db.user.findMany({ where: { orgId, isActive: true }, select: { id: true } })
    void emitToUsers(
      users.map((u) => u.id),
      'channels:refresh',
      {},
    ).catch(() => {})
  } catch {
    // never let broadcast break the route
  }
}

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: {
        members: {
          include: { user: { include: { agent: { select: { handle: true } } } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const myMembership = channel.members.find((m) => m.userId === me.id)
    const isPrivateish = channel.kind === 'private' || channel.kind === 'dm' || channel.kind === 'group_dm'
    if (isPrivateish && !myMembership) throw new HttpError(403, 'You are not a member of this channel')

    return {
      channel: {
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        topic: channel.topic,
        kind: channel.kind,
        isArchived: channel.isArchived,
        isDefault: channel.isDefault,
        memberCount: channel.members.length,
        createdBy: channel.createdBy,
      },
      members: channel.members.map((m) => serializeUser(m.user)),
      myRole: myMembership?.role ?? null,
    }
  })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  topic: z.string().trim().max(300).nullable().optional(),
  isArchived: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Invalid channel update')
    const { name, topic, isArchived } = parsed.data

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: { members: { where: { userId: me.id } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    const membership = channel.members[0] ?? null

    const isAdmin = me.role === 'owner' || me.role === 'admin' || membership?.role === 'owner'
    const wantsStructural = name !== undefined || isArchived !== undefined
    if (wantsStructural && !isAdmin) {
      throw new HttpError(403, 'Only workspace admins or the channel owner can rename or archive')
    }
    if (!membership && topic === undefined) throw new HttpError(403, 'You are not a member of this channel')

    const data: Record<string, unknown> = {}
    if (name !== undefined) {
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
      if (!slug) throw new HttpError(400, 'Channel name must contain letters or numbers')
      const clash = await db.channel.findFirst({ where: { orgId: me.orgId, slug, NOT: { id: channel.id } } })
      if (clash) throw new HttpError(409, `A channel called #${slug} already exists`)
      data.name = slug
      data.slug = slug
    }
    if (topic !== undefined) data.topic = topic || null
    if (isArchived !== undefined) data.isArchived = isArchived

    const updated = await db.channel.update({ where: { id: channel.id }, data })
    if (name !== undefined || isArchived !== undefined) await broadcastRefresh(me.orgId)

    return { id: updated.id, name: updated.name, slug: updated.slug, topic: updated.topic, isArchived: updated.isArchived }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: { members: { where: { userId: me.id } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    if (channel.kind === 'dm' || channel.kind === 'group_dm') {
      throw new HttpError(400, 'Direct messages cannot be deleted')
    }
    const membership = channel.members[0] ?? null
    const isAdmin = me.role === 'owner' || me.role === 'admin' || membership?.role === 'owner'
    if (!isAdmin) throw new HttpError(403, 'Only workspace admins or the channel owner can delete a channel')

    await db.channel.delete({ where: { id: channel.id } })
    await broadcastRefresh(me.orgId)
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
