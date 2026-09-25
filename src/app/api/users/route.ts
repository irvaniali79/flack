import { db } from '@/lib/db'
import { handle, requireUser } from '@/lib/auth'
import { serializeUser } from '@/lib/serialize'

export async function GET() {
  return handle(async () => {
    await requireUser()
    const org = await db.org.findFirst()
    const users = await db.user.findMany({
      where: { orgId: org?.id, isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { agent: { select: { handle: true } } },
    })
    return users.map(serializeUser)
  })
}

export const dynamic = 'force-dynamic'
