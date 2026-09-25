import { db } from '@/lib/db'
import { handle } from '@/lib/auth'

export async function GET() {
  return handle(async () => {
    const org = await db.org.findFirst()
    const humans = await db.user.findMany({
      where: { orgId: org?.id, kind: 'human', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true, title: true, avatarColor: true, role: true, totpEnabled: true },
    })
    return { demoPassword: 'demo1234', users: humans }
  })
}

export const dynamic = 'force-dynamic'
