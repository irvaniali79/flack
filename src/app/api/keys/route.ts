import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { generateApiKey, serializeApiKey } from '@/lib/api-keys'
import { writeAudit } from '@/lib/audit'

const MAX_KEYS_PER_USER = 10

// ─── GET: list my API keys (active + revoked) ────────────────────────────────

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const keys = await db.apiKey.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
    })
    return { keys: keys.map(serializeApiKey) }
  })
}

// ─── POST: create a new key — full key returned exactly once ─────────────────

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'Key name must be 1–60 characters')

    const activeCount = await db.apiKey.count({
      where: { userId: me.id, revokedAt: null },
    })
    if (activeCount >= MAX_KEYS_PER_USER) {
      throw new HttpError(400, `You already have ${MAX_KEYS_PER_USER} active keys — revoke one first`)
    }

    const { key, keyHash, keyPrefix } = generateApiKey()
    const record = await db.apiKey.create({
      data: {
        orgId: me.orgId,
        userId: me.id,
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        scopes: 'mcp',
      },
    })

    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'api_key.create',
      target: keyPrefix,
      meta: { name: parsed.data.name },
    })

    return {
      key: serializeApiKey(record),
      // Full secret — shown once in the UI, never stored in plaintext
      secret: key,
    }
  })
}

export const dynamic = 'force-dynamic'
