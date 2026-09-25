// Mention parsing: @token → user ids + specials (@channel / @here).

export interface MentionCandidate {
  id: string
  name: string
  handle?: string | null
}

/** lowercase, strip everything that isn't alphanumeric */
export function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Parses @mentions in a message body against the channel's member list.
 * Matches: full normalized name ("sarahchen"), first word ("sarah"),
 * agent handles ("aria"), and the specials @channel / @here.
 */
export function parseMentions(
  body: string,
  members: MentionCandidate[],
): { userIds: string[]; specials: string[] } {
  const userIds = new Set<string>()
  const specials = new Set<string>()

  const firstWordById = new Map<string, string>()
  const fullById = new Map<string, string>()
  const byHandle = new Map<string, string>()
  for (const member of members) {
    const words = member.name.trim().split(/\s+/)
    if (words[0]) firstWordById.set(normalizeToken(words[0]), member.id)
    fullById.set(normalizeToken(member.name), member.id)
    if (member.handle) byHandle.set(normalizeToken(member.handle), member.id)
  }

  const tokens = body.match(/@([a-zA-Z0-9_]+)/g) ?? []
  for (const rawToken of tokens) {
    const token = normalizeToken(rawToken.slice(1))
    if (!token) continue
    if (token === 'channel' || token === 'here') {
      specials.add(`@${token}`)
      continue
    }
    const byHandleId = byHandle.get(token)
    if (byHandleId) {
      userIds.add(byHandleId)
      continue
    }
    const fullId = fullById.get(token)
    if (fullId) {
      userIds.add(fullId)
      continue
    }
    const firstId = firstWordById.get(token)
    if (firstId) userIds.add(firstId)
  }

  return { userIds: [...userIds], specials: [...specials] }
}
