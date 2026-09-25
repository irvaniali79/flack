// API keys for programmatic access (MCP server + tool playground).
// Keys look like: acme_<32 hex chars>. Only the SHA-256 hash is stored;
// the full key is shown exactly once at creation time.
import { createHash, randomBytes } from 'crypto'
import { db } from './db'
import { HttpError } from './auth'

const KEY_PREFIX = 'acme_'

export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = KEY_PREFIX + randomBytes(24).toString('hex')
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, KEY_PREFIX.length + 8), // "acme_ab12cd34"
  }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex')
}

export type ApiKeyUser = {
  userId: string
  orgId: string
  keyId: string
  keyPrefix: string
}

/**
 * Authenticates an `Authorization: Bearer acme_…` header against stored API
 * keys. Throws HttpError 401 on missing/invalid/revoked keys. Updates
 * lastUsedAt fire-and-forget (never blocks or fails the request).
 */
export async function requireApiKeyUser(request: Request): Promise<ApiKeyUser> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) throw new HttpError(401, 'Missing Authorization: Bearer <api key> header')
  const key = match[1].trim()
  if (!key.startsWith(KEY_PREFIX)) throw new HttpError(401, 'Invalid API key format')

  const record = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    include: { user: true },
  })
  if (!record) throw new HttpError(401, 'Invalid API key')
  if (record.revokedAt) throw new HttpError(401, 'This API key has been revoked')
  if (!record.user.isActive) throw new HttpError(401, 'API key owner is deactivated')

  // Fire-and-forget usage stamp
  void db.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    userId: record.userId,
    orgId: record.orgId,
    keyId: record.id,
    keyPrefix: record.keyPrefix,
  }
}

/** Serializes a key for client display — never leaks the hash. */
export function serializeApiKey(key: {
  id: string
  name: string
  keyPrefix: string
  scopes: string
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes.split(',').filter(Boolean),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }
}
