import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { serializeUser } from '@/lib/serialize'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    return serializeUser(me)
  })
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  statusEmoji: z.string().trim().max(16).nullable().optional(),
  statusText: z.string().trim().max(120).nullable().optional(),
  dndEnabled: z.boolean().optional(),
  timezone: z.string().trim().max(64).optional(),
})

export async function PATCH(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Invalid profile fields')
    const data = parsed.data
    if (Object.keys(data).length === 0) return serializeUser(me)

    const updated = await db.user.update({
      where: { id: me.id },
      data,
      include: { agent: { select: { handle: true } } },
    })

    return serializeUser(updated)
  })
}

export const dynamic = 'force-dynamic'
