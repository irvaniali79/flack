import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { emitToChannel } from '@/lib/realtime-server'
import { serializeMessage } from '@/lib/serialize'
import type { MessageFull } from '@/lib/serialize'

type Params = { params: Promise<{ id: string }> }

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const message = await db.message.findUnique({ where: { id }, include: messageInclude })
    if (!message) throw new HttpError(404, 'Message not found')

    const channel = await db.channel.findFirst({
      where: { id: message.channelId, orgId: me.orgId },
      include: { members: { where: { userId: me.id } } },
    })
    if (!channel) throw new HttpError(404, 'Message not found')
    if (channel.members.length === 0 && channel.kind !== 'public') {
      throw new HttpError(403, 'You do not have access to this message')
    }

    return { message: serializeMessage(message as MessageFull) }
  })
}

const patchSchema = z.object({ body: z.string().min(1).max(8000) })

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Message body must be 1–8000 characters')

    const existing = await db.message.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Message not found')
    if (existing.deletedAt) throw new HttpError(400, 'This message was deleted')
    if (existing.senderId !== me.id) throw new HttpError(403, 'You can only edit your own messages')

    const message = await db.message.update({
      where: { id },
      data: { body: parsed.data.body, editedAt: new Date() },
      include: messageInclude,
    })

    const dto = serializeMessage(message as MessageFull)
    void emitToChannel(message.channelId, 'message:updated', { message: dto }).catch(() => {})
    return { message: dto }
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const existing = await db.message.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Message not found')
    if (existing.deletedAt) return { ok: true }
    const isAdmin = me.role === 'owner' || me.role === 'admin'
    if (existing.senderId !== me.id && !isAdmin) {
      throw new HttpError(403, 'You can only delete your own messages')
    }

    await db.message.update({
      where: { id },
      data: { deletedAt: new Date(), isPinned: false },
    })
    void emitToChannel(existing.channelId, 'message:deleted', { id, channelId: existing.channelId }).catch(() => {})
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
