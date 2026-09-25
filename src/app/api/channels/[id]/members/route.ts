import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToUsers } from '@/lib/realtime-server'
import { serializeUser } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ userId: z.string().min(1) })

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'userId is required')

    const channel = await db.channel.findFirst({
      where: { id, orgId: me.orgId },
      include: { members: true },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    if (channel.kind === 'dm' || channel.kind === 'group_dm') {
      throw new HttpError(400, 'Direct messages cannot gain new members')
    }
    if (!channel.members.some((m) => m.userId === me.id)) {
      throw new HttpError(403, 'You are not a member of this channel')
    }

    const user = await db.user.findFirst({
      where: { id: parsed.data.userId, orgId: me.orgId, isActive: true },
      include: { agent: { select: { handle: true } } },
    })
    if (!user) throw new HttpError(404, 'User not found')
    if (channel.members.some((m) => m.userId === user.id)) {
      return { ok: true, alreadyMember: true, user: serializeUser(user) }
    }

    await db.channelMember.create({ data: { channelId: channel.id, userId: user.id } })
    void emitToUsers([user.id], 'channels:refresh', { channelId: channel.id }).catch(() => {})

    return { ok: true, user: serializeUser(user) }
  })
}

const patchSchema = z.object({
  notifyLevel: z.enum(['all', 'mentions', 'none']).optional(),
  muted: z.boolean().optional(),
})

/** Update MY membership notification preferences for this channel. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Invalid notification preferences')

    const membership = await db.channelMember.findFirst({ where: { channelId: id, userId: me.id } })
    if (!membership) throw new HttpError(403, 'You are not a member of this channel')

    const updated = await db.channelMember.update({
      where: { id: membership.id },
      data: {
        ...(parsed.data.notifyLevel !== undefined ? { notifyLevel: parsed.data.notifyLevel } : {}),
        ...(parsed.data.muted !== undefined ? { muted: parsed.data.muted } : {}),
      },
    })
    return { notifyLevel: updated.notifyLevel, muted: updated.muted }
  })
}

export const dynamic = 'force-dynamic'
