// Quiet hours / Do Not Disturb — shared pure helpers (safe on client + server).
//
// Semantics (Slack-style):
//   • dndEnabled with NO window  → quiet all day (the manual toggle)
//   • dndEnabled with a window   → quiet between start and end (wraps midnight,
//                                  e.g. 22:00 → 07:00 covers the night)
//   • disabled                   → notifications behave normally
// Notifications created during quiet hours are stored with suppressed=true:
// no ding, no badge. When the window ends, the scheduler tick "releases" them
// as a digest (suppressed → false) so nothing is ever lost.

export interface QuietHoursUser {
  dndEnabled: boolean
  dndStart: string | null
  dndEnd: string | null
}

/** Parse "HH:MM" (24h) into minutes since midnight. Returns null when invalid. */
export function parseHHmm(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** True when the user is inside their quiet-hours window at `now` (server/user-local time). */
export function isQuietHours(user: QuietHoursUser | null | undefined, now: Date = new Date()): boolean {
  if (!user || !user.dndEnabled) return false
  const start = parseHHmm(user.dndStart)
  const end = parseHHmm(user.dndEnd)
  // Enabled without a valid window = quiet all day
  if (start === null || end === null) return true
  if (start === end) return true // zero-length window = 24h
  const minutes = now.getHours() * 60 + now.getMinutes()
  return start < end
    ? minutes >= start && minutes < end // same-day window (09:00 → 17:00)
    : minutes >= start || minutes < end // wraps midnight (22:00 → 07:00)
}

/** "22:00" → "10:00 PM" style label for UI chips. */
export function formatHHmm(value: string | null | undefined): string {
  const m = parseHHmm(value)
  if (m === null) return '—'
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${period}`
}

/**
 * When the current quiet period ends, as "7:00 AM" (for banner copy).
 * For the all-day case there is no end — returns null.
 */
export function quietUntilLabel(user: QuietHoursUser, now: Date = new Date()): string | null {
  if (!isQuietHours(user, now)) return null
  const end = parseHHmm(user.dndEnd)
  if (end === null) return null // all-day DND
  return formatHHmm(user.dndEnd)
}
