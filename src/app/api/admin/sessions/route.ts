// GET /api/admin/sessions — every ACTIVE (non-expired) session in the org,
// grouped by user. The admin-side security audit view that complements the
// per-user Security tab: spot forgotten devices org-wide, revoke anything
// suspicious. Session rows never expose tokens — only derived device labels.
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { describeUserAgent, handle, requireAdmin, SESSION_COOKIE } from '@/lib/auth'

export async function GET() {
  return handle(async () => {
    const me = await requireAdmin()
    const jar = await cookies()
    const currentToken = jar.get(SESSION_COOKIE)?.value ?? null

    const rows = await db.session.findMany({
      where: {
        expiresAt: { gt: new Date() },
        user: { orgId: me.orgId },
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        token: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            kind: true,
            role: true,
            avatarColor: true,
          },
        },
      },
    })

    // group by user; users ordered by most-recent activity
    const byUser = new Map<
      string,
      {
        userId: string
        name: string
        email: string
        kind: string
        role: string
        avatarColor: string
        sessions: {
          id: string
          current: boolean
          device: string
          createdAt: string
          lastUsedAt: string
          expiresAt: string
        }[]
      }
    >()

    for (const row of rows) {
      let bucket = byUser.get(row.user.id)
      if (!bucket) {
        bucket = {
          userId: row.user.id,
          name: row.user.name,
          email: row.user.email,
          kind: row.user.kind,
          role: row.user.role,
          avatarColor: row.user.avatarColor,
          sessions: [],
        }
        byUser.set(row.user.id, bucket)
      }
      bucket.sessions.push({
        id: row.id,
        current: row.token === currentToken,
        device: describeUserAgent(row.userAgent),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })
    }

    const users = [...byUser.values()].sort((a, b) => {
      const aLatest = new Date(a.sessions[0]?.lastUsedAt ?? 0).getTime()
      const bLatest = new Date(b.sessions[0]?.lastUsedAt ?? 0).getTime()
      return bLatest - aLatest
    })

    return {
      users,
      totals: {
        sessions: rows.length,
        users: users.length,
        mine: users.find((u) => u.userId === me.id)?.sessions.length ?? 0,
      },
    }
  })
}

export const dynamic = 'force-dynamic'
