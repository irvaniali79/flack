// Revoke a single session by id. Revoking the CURRENT session is allowed —
// it is a sign-out (the client then clears its local state like logout).
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser, SESSION_COOKIE } from '@/lib/auth'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser()
    const { id } = await params

    const session = await db.session.findFirst({ where: { id, userId: me.id } })
    if (!session) throw new HttpError(404, 'Session not found (already revoked?)')

    await db.session.delete({ where: { id: session.id } })

    const jar = await cookies()
    const wasCurrent = jar.get(SESSION_COOKIE)?.value === session.token
    if (wasCurrent) {
      jar.delete(SESSION_COOKIE)
      return { revoked: 1, wasCurrent: true }
    }
    return { revoked: 1, wasCurrent: false }
  })
}

export const dynamic = 'force-dynamic'
