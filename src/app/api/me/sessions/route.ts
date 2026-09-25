// Active sessions for the signed-in user — the Security tab's device list.
//   GET    /api/me/sessions                → sessions (current flagged, token never exposed)
//   POST   /api/me/sessions/revoke-others  → sign out every OTHER session
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { describeUserAgent, handle, HttpError, requireUser, SESSION_COOKIE } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const jar = await cookies()
    const currentToken = jar.get(SESSION_COOKIE)?.value ?? null

    const sessions = await db.session.findMany({
      where: { userId: me.id, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, token: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    })

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        current: s.token === currentToken,
        device: describeUserAgent(s.userAgent),
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    }
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const url = new URL(request.url)
    if (url.searchParams.get('action') !== 'revoke-others') {
      throw new HttpError(404, 'Unknown action — use revoke-others')
    }
    const jar = await cookies()
    const currentToken = jar.get(SESSION_COOKIE)?.value ?? null
    const revoked = await db.session.deleteMany({
      where: { userId: me.id, ...(currentToken ? { token: { not: currentToken } } : {}) },
    })
    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'auth.sessions_revoked',
      target: me.email,
      meta: { count: revoked.count },
    }).catch(() => {})
    return { revoked: revoked.count }
  })
}

export const dynamic = 'force-dynamic'
