// DELETE /api/admin/sessions/[id] — admin revokes ANY user's session (org
// security audit). Revoking the admin's own current session clears their
// cookie too (same semantics as the per-user Security tab).
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin, SESSION_COOKIE } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireAdmin()
    const { id } = await params

    const session = await db.session.findFirst({
      where: { id, user: { orgId: me.orgId } },
      select: { id: true, token: true, userId: true, user: { select: { name: true, email: true } } },
    })
    if (!session) throw new HttpError(404, 'Session not found')

    await db.session.delete({ where: { id: session.id } })

    // If the admin revoked their own current session, log them out
    const jar = await cookies()
    const currentToken = jar.get(SESSION_COOKIE)?.value ?? null
    const revokedOwn = session.token === currentToken
    if (revokedOwn) {
      jar.delete(SESSION_COOKIE)
    }

    void writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'admin.session_revoked',
      target: session.user.email,
      meta: { sessionId: session.id, userName: session.user.name, own: revokedOwn },
    }).catch(() => {})

    return { ok: true, revokedOwn }
  })
}

export const dynamic = 'force-dynamic'
