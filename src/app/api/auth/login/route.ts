import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, handle, HttpError, verifyPassword } from '@/lib/auth'
import { serializeUser } from '@/lib/serialize'

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Email and password are required')

    const email = parsed.data.email.toLowerCase().trim()
    const user = await db.user.findUnique({
      where: { email },
      include: { agent: { select: { handle: true } } },
    })
    if (!user || !user.isActive) throw new HttpError(401, 'Invalid email or password')

    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      throw new HttpError(401, 'Invalid email or password')
    }

    await createSession(user.id)
    return { user: serializeUser(user) }
  })
}

export const dynamic = 'force-dynamic'
