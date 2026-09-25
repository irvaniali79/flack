import { format, isSameDay, isThisYear, parseISO } from 'date-fns'

export function formatTime(iso: string): string {
  return format(parseISO(iso), 'h:mm a')
}

export function formatTimeHover(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy h:mm a')
}

export function dayLabel(iso: string): string {
  const date = parseISO(iso)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  if (isSameDay(date, now)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  if (isThisYear(date)) return format(date, 'EEEE, MMMM d')
  return format(date, 'MMMM d, yyyy')
}

export function formatRelativeTime(iso: string): string {
  const date = parseISO(iso)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return format(date, isThisYear(date) ? 'MMM d' : 'MMM d, yyyy')
}

/** Local time in a timezone (approximate via Intl API). */
export function localTimeIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())
  }
}

export function localTimezoneLabel(timezone: string): string {
  try {
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value
    return offset ? `${timezone} (${offset})` : timezone
  } catch {
    return timezone
  }
}
