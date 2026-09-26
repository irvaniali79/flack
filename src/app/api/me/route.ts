import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { serializeUser } from '@/lib/serialize'
import { ACCENT_KEYS } from '@/lib/theme-options'
import { emitToUsers } from '@/lib/realtime-server'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    return serializeUser(me)
  })
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
// Photo URLs must point at our own file service (no external hosts / XSS vectors)
const OWN_FILE_URL = /^\/api\/files\/[\w-]{1,120}$/

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  statusEmoji: z.string().trim().max(16).nullable().optional(),
  statusText: z.string().trim().max(120).nullable().optional(),
  // Profile photo — upload via /api/files first, then set the returned URL (null removes)
  avatarUrl: z.string().regex(OWN_FILE_URL, 'Invalid photo URL').nullable().optional(),
  // Profile background/cover photo — same contract as avatarUrl
  bannerUrl: z.string().regex(OWN_FILE_URL, 'Invalid photo URL').nullable().optional(),
  dndEnabled: z.boolean().optional(),
  // Quiet-hours window, "HH:MM" 24h — null clears the schedule
  dndStart: z.string().regex(HHMM, 'Use HH:MM (24h)').nullable().optional(),
  dndEnd: z.string().regex(HHMM, 'Use HH:MM (24h)').nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  // off | digest — whether released quiet-hour digests also go to email
  emailNotif: z.enum(['off', 'digest']).optional(),
  // Accent color theme key (validated against the catalog)
  accentTheme: z.string().refine((v) => (ACCENT_KEYS as string[]).includes(v), 'Unknown theme').optional(),
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

    // Broadcast the fresh profile (name/status/photos/theme) to everyone in
    // the org so avatars + profile dialogs update live on other clients.
    if (
      'name' in data ||
      'title' in data ||
      'statusEmoji' in data ||
      'statusText' in data ||
      'avatarUrl' in data ||
      'bannerUrl' in data ||
      'accentTheme' in data
    ) {
      const orgUsers = await db.user.findMany({ where: { orgId: me.orgId }, select: { id: true } })
      const dto = serializeUser(updated)
      void emitToUsers(orgUsers.map((u) => u.id), 'user:updated', { user: dto })
    }

    return serializeUser(updated)
  })
}

export const dynamic = 'force-dynamic'
