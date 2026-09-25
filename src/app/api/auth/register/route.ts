import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, handle, hashPassword, HttpError } from '@/lib/auth'
import { serializeUser } from '@/lib/serialize'

// Warm palette — no blue/indigo
const AVATAR_PALETTE = [
  '#059669', // emerald
  '#0d9488', // teal
  '#d97706', // amber
  '#ea580c', // orange
  '#e11d48', // rose
  '#db2777', // pink
  '#9333ea', // purple
  '#65a30d', // lime
]

const schema = z.object({
  email: z.string().email().max(200),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(200),
})

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      throw new HttpError(400, 'Enter a valid email, name (2+ chars) and password (8+ chars)')
    }

    const email = parsed.data.email.toLowerCase().trim()
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new HttpError(409, 'An account with that email already exists')

    const org = await db.org.findFirst()
    if (!org) throw new HttpError(500, 'No workspace found')

    const user = await db.user.create({
      data: {
        orgId: org.id,
        email,
        name: parsed.data.name,
        passwordHash: hashPassword(parsed.data.password),
        role: 'member',
        avatarColor: AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)],
      },
      include: { agent: { select: { handle: true } } },
    })

    // Auto-join all default channels
    const defaults = await db.channel.findMany({ where: { orgId: org.id, isDefault: true } })
    if (defaults.length > 0) {
      await db.channelMember.createMany({
        data: defaults.map((channel) => ({ channelId: channel.id, userId: user.id })),
      })
    }

    await createSession(user.id, request)
    return { user: serializeUser(user) }
  })
}

export const dynamic = 'force-dynamic'
