// Shared custom-emoji alias helpers (server + client safe).
// Aliases live as a JSON string array in the CustomEmoji.aliases column
// (SQLite has no array primitive) and resolve to the same image as the
// primary shortcode — exactly like Slack's ":shipit: → :ship-it:" aliases.

export const ALIAS_MAX = 10
export const SHORTCODE_RE = /^[a-z0-9][a-z0-9_]{1,31}$/

/** Parse the JSON-string alias column into a string array. */
export function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((a): a is string => typeof a === 'string' && SHORTCODE_RE.test(a))
  } catch {
    return []
  }
}

export interface AliasValidationIssue {
  index: number
  alias: string
  reason: string
}

/**
 * Validate a candidate alias list against the shortcode format rules.
 * Returns { ok, aliases, issues } — deduped, lowercased, ordered.
 */
export function validateAliasList(raw: string[]): {
  ok: boolean
  aliases: string[]
  issues: AliasValidationIssue[]
} {
  const issues: AliasValidationIssue[] = []
  const seen = new Set<string>()
  const aliases: string[] = []
  raw
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0)
    .forEach((alias, i) => {
      if (!SHORTCODE_RE.test(alias)) {
        issues.push({
          index: i,
          alias,
          reason: '2–32 chars: lowercase letters, digits, underscores',
        })
        return
      }
      if (seen.has(alias)) return // silent dedupe
      seen.add(alias)
      aliases.push(alias)
    })
  if (aliases.length > ALIAS_MAX) {
    issues.push({ index: -1, alias: '', reason: `At most ${ALIAS_MAX} aliases per emoji` })
  }
  return { ok: issues.length === 0, aliases: aliases.slice(0, ALIAS_MAX), issues }
}
