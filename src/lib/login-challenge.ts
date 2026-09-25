// In-memory login challenges for the 2FA step. After a correct password we
// hand the browser a short-lived challenge id instead of a session; the
// session is only minted once a valid TOTP/recovery code arrives.
// Module-level state is fine here: the app runs as a single server process,
// challenges expire in 5 minutes, and a restart just forces re-login.
import { randomBytes } from 'crypto'

interface Challenge {
  userId: string
  expiresAt: number
}

const TTL_MS = 5 * 60 * 1000

const challenges = new Map<string, Challenge>()

// Opportunistic sweep so the map never grows unbounded
function sweep() {
  const now = Date.now()
  for (const [id, ch] of challenges) {
    if (ch.expiresAt < now) challenges.delete(id)
  }
}

export function createLoginChallenge(userId: string): string {
  sweep()
  const id = randomBytes(24).toString('hex')
  challenges.set(id, { userId, expiresAt: Date.now() + TTL_MS })
  return id
}

/** Returns the userId for a live challenge, or null (expired/unknown). */
export function resolveLoginChallenge(id: string): string | null {
  const ch = challenges.get(id)
  if (!ch) return null
  if (ch.expiresAt < Date.now()) {
    challenges.delete(id)
    return null
  }
  return ch.userId
}

/** One-shot: consume the challenge so it cannot be replayed. */
export function consumeLoginChallenge(id: string): string | null {
  const userId = resolveLoginChallenge(id)
  if (userId) challenges.delete(id)
  return userId
}
