import { cookies } from 'next/headers'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'flack_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// ─── Password hashing (scrypt, no native deps) ───────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** "Mozilla/5.0 (Macintosh…) Chrome/129.0" → "Chrome 129 · macOS" (best-effort). */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  let browser = 'Unknown browser'
  if (/Edg\/(\d+)/.test(ua)) browser = `Edge ${ua.match(/Edg\/(\d+)/)![1]}`
  else if (/OPR\/(\d+)/.test(ua)) browser = `Opera ${ua.match(/OPR\/(\d+)/)![1]}`
  else if (/Chrome\/(\d+)/.test(ua)) browser = `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}`
  else if (/Firefox\/(\d+)/.test(ua)) browser = `Firefox ${ua.match(/Firefox\/(\d+)/)![1]}`
  else if (/Version\/(\d+)/.test(ua) && /Safari\//.test(ua)) browser = `Safari ${ua.match(/Version\/(\d+)/)![1]}`
  else if (/curl|fetch|node|bun/i.test(ua)) browser = 'API client'

  let os = 'Unknown OS'
  if (/iPad/.test(ua)) os = 'iPad'
  else if (/iPhone|iPod/.test(ua)) os = 'iPhone'
  else if (/Android (\d+)/.test(ua)) os = `Android ${ua.match(/Android (\d+)/)![1]}`
  else if (/Windows NT 10/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return `${browser} · ${os}`
}

export async function createSession(userId: string, request?: Request): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: {
      token,
      userId,
      expiresAt,
      userAgent: request ? request.headers.get('user-agent') : null,
      lastUsedAt: new Date(),
    },
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // sandbox runs behind http gateway
    path: '/',
    expires: expiresAt,
  })
  return token
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {})
  }
  jar.delete(SESSION_COOKIE)
}

export type SessionUser = Awaited<ReturnType<typeof db.user.findFirst>>

/** Returns the logged-in user (with org), or null. */
export async function getSessionUser() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: { user: { include: { org: true } } },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  if (!session.user.isActive) return null
  // Presence signal for the sessions list — write at most once per 5 minutes
  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
    void db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  }
  return session.user
}

/** Throws a 401-friendly error object when not authenticated. */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new HttpError(401, 'Not authenticated')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (!['owner', 'admin'].includes(user.role)) {
    throw new HttpError(403, 'Admin role required')
  }
  return user
}

/** Wraps a route handler and converts HttpError to a JSON response. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const data = await fn()
    return Response.json((data ?? { ok: true }) as Record<string, unknown>)
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api] unhandled error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
