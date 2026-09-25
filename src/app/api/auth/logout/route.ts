import { destroySession, handle } from '@/lib/auth'

export async function POST() {
  return handle(async () => {
    await destroySession()
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
