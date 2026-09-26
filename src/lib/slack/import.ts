// Slack workspace-export import engine.
//
// Parses a Slack export ZIP (admin-level export: users.json + channels.json /
// groups.json + one JSON file of messages per channel) and imports it into the
// workspace, preserving history:
//
//   • users.json   → matched by email against existing users; missing humans
//                    are created (random password, member role). Bots become
//                    regular users flagged "(Slack bot)" so their messages keep
//                    attribution.
//   • channels/groups → public/private channels (createdAt from Slack's epoch).
//   • messages     → mrkdwn converted via the same slackTextToBody used by the
//                    compat API, `<@U…>` mentions resolved to @Name, thread_ts
//                    → parentId (reply ordering preserved), reactions imported
//                    via shortcode → char, ts → createdAt (millisecond-
//                    precision with a monotonic guard so channel order is
//                    exactly preserved).
//   • idempotency  → channels and messages carry externalId (Slack id / ts);
//                    re-importing the same export skips what already exists.
//
// Skipped by design: DM/mpim channels, file binaries (exports reference
// private URLs), join/leave/purpose subtypes, deleted messages, message edits.
import { randomBytes } from 'crypto'
import { unzipSync } from 'fflate'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { parseMentions } from '@/lib/mentions'
import { slackTextToBody, slackEmojiToChar } from '@/lib/slack/compat'
import { writeAudit } from '@/lib/audit'

// ─── Types for the Slack export shapes we consume ────────────────────────────

export type SlackExportUser = {
  id: string
  name?: string
  deleted?: boolean
  is_bot?: boolean
  is_email_confirmed?: boolean
  profile?: { email?: string; real_name?: string; display_name?: string; title?: string }
}

export type SlackExportChannel = {
  id: string
  name: string
  created?: number
  creator?: string
  topic?: { value?: string }
  purpose?: { value?: string }
  members?: string[]
}

export type SlackExportReaction = { name: string; users?: string[] }

export type SlackExportMessage = {
  type?: string
  subtype?: string
  ts?: string
  thread_ts?: string
  user?: string
  user_profile?: { name?: string } // fallback display for deleted users
  text?: string
  deleted?: boolean
  pinned_to?: string[]
  reactions?: SlackExportReaction[]
  edited?: { ts?: string }
}

export type ImportSummary = {
  ok: true
  usersMatched: number
  usersCreated: number
  botsImported: number
  channelsImported: number
  channelsSkipped: number
  messagesImported: number
  threadsImported: number
  reactionsImported: number
  messagesSkippedSubtype: number
  missingSenderMessages: number
  channels: { name: string; kind: string; messages: number }[]
  generatedPasswords: { email: string; password: string }[]
  warnings: string[]
}

// Subtypes that carry no conversational value in our model → skipped. Slack
// exports tag join/leave notices, bot messages, file shares, edits and more;
// a plain message (or thread reply) is the only shape we can import faithfully.
const AVATAR_COLORS = ['#e11d48', '#ea580c', '#059669', '#0d9488', '#7c3aed', '#db2777', '#65a30d', '#d97706']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** Slack ts "1234567890.000123" → Date (millisecond precision). */
function tsToDate(ts: string): Date | null {
  const [sec, frac = '0'] = ts.split('.')
  const ms = Math.round(Number(frac.padEnd(3, '0').slice(0, 3)))
  const total = Number(sec) * 1000 + (Number.isFinite(ms) ? ms : 0)
  if (!Number.isFinite(total)) return null
  return new Date(total)
}

function parseJson<T>(raw: Uint8Array | string, file: string, warnings: string[]): T | null {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as T
  } catch {
    warnings.push(`Could not parse ${file} — skipping`)
    return null
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Converts `:shortcode:` sequences to emoji characters, the way Slack renders
 * them in its client (e.g. "nice :tada:" → "nice 🎉"). Unknown shortcodes are
 * left untouched. Code spans/blocks are protected.
 */
function inlineEmoji(text: string): string {
  const convert = (chunk: string) =>
    chunk.replace(/:([a-z0-9_+-]+):/gi, (full, name: string) => {
      const char = slackEmojiToChar(name)
      return char ?? full
    })

  let out = ''
  let rest = text
  while (rest.length > 0) {
    const fence = rest.indexOf('```')
    const tick = rest.indexOf('`')
    let cutAt = -1
    let closer = ''
    if (fence !== -1 && (tick === -1 || fence <= tick)) {
      cutAt = fence
      closer = '```'
    } else if (tick !== -1) {
      cutAt = tick
      closer = '`'
    } else {
      out += convert(rest)
      break
    }
    out += convert(rest.slice(0, cutAt))
    const end = rest.indexOf(closer, cutAt + closer.length)
    if (end === -1) {
      out += rest.slice(cutAt)
      break
    }
    out += rest.slice(cutAt, end + closer.length)
    rest = rest.slice(end + closer.length)
  }
  return out
}

// ─── The engine ──────────────────────────────────────────────────────────────

export async function importSlackExport(
  actor: { id: string; orgId: string; name: string },
  zipBytes: Uint8Array,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    ok: true,
    usersMatched: 0,
    usersCreated: 0,
    botsImported: 0,
    channelsImported: 0,
    channelsSkipped: 0,
    messagesImported: 0,
    threadsImported: 0,
    reactionsImported: 0,
    messagesSkippedSubtype: 0,
    missingSenderMessages: 0,
    channels: [],
    generatedPasswords: [],
    warnings: [],
  }

  // ── 1. Unzip ──────────────────────────────────────────────────────────────
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBytes)
  } catch {
    throw new Error('Not a valid ZIP file — expected a Slack workspace export')
  }
  const entry = (name: string): Uint8Array | undefined => {
    // exports sometimes nest everything under a folder
    const direct = files[name]
    if (direct) return direct
    for (const [path, data] of Object.entries(files)) {
      if (path.endsWith(`/${name}`)) return data
    }
    return undefined
  }

  const usersRaw = entry('users.json')
  if (!usersRaw) throw new Error('users.json not found in the export — is this a workspace export?')
  const slackUsers = parseJson<SlackExportUser[]>(usersRaw, 'users.json', summary.warnings) ?? []

  // ── 2. Users: match by email, create the rest ─────────────────────────────
  const orgUsers = await db.user.findMany({ where: { orgId: actor.orgId }, include: { agent: { select: { handle: true } } } })
  const byEmail = new Map(orgUsers.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]))
  const byExternalId = new Map(orgUsers.filter((u) => u.externalId).map((u) => [u.externalId!, u]))

  /** Slack user id → our user id (null = unknown/deleted sender) */
  const userIdMap = new Map<string, string>()
  /** Slack user id → display info for mrkdwn mention resolution */
  const mentionMap = new Map<string, { name: string; handle?: string | null }>()

  for (const su of slackUsers) {
    if (!su.id) continue

    // Re-import: already linked via externalId from a previous run
    const linked = byExternalId.get(su.id)
    if (linked) {
      userIdMap.set(su.id, linked.id)
      mentionMap.set(su.id, { name: linked.name, handle: linked.agent?.handle ?? null })
      // Counts as matched: the Slack user resolved to an existing account
      summary.usersMatched++
      continue
    }

    // Match by email (the plan's "email-based user matching")
    const email = su.profile?.email?.toLowerCase()
    if (email && !su.is_bot) {
      const existing = byEmail.get(email)
      if (existing) {
        await db.user.update({ where: { id: existing.id }, data: { externalId: su.id } }).catch(() => {})
        userIdMap.set(su.id, existing.id)
        mentionMap.set(su.id, { name: existing.name, handle: existing.agent?.handle ?? null })
        byExternalId.set(su.id, existing)
        summary.usersMatched++
        continue
      }
    }

    // Create the user. Deleted Slack accounts stay unlinked (messages render
    // as "Unknown") — only active users get accounts.
    if (su.deleted) continue

    const realName = su.profile?.real_name || su.profile?.display_name || su.name || su.id
    const isBot = !!su.is_bot
    const password = `flack-${randomBytes(6).toString('hex')}`

    try {
      const created = await db.user.create({
        data: {
          orgId: actor.orgId,
          email: email || `slack-${su.id}@import.local`,
          name: isBot ? `${realName} (Slack bot)` : realName,
          passwordHash: hashPassword(password),
          title: isBot ? 'Imported from Slack — bot user' : (su.profile?.title || 'Imported from Slack'),
          avatarColor: colorFor(su.id),
          kind: 'human',
          role: 'member',
          externalId: su.id,
        },
      })
      userIdMap.set(su.id, created.id)
      mentionMap.set(su.id, { name: realName, handle: null })
      if (isBot) {
        summary.botsImported++
      } else {
        summary.usersCreated++
        if (email) summary.generatedPasswords.push({ email: email, password })
      }
    } catch {
      // e.g. email collision with a different case — fall back to import.local
      try {
        const created = await db.user.create({
          data: {
            orgId: actor.orgId,
            email: `slack-${su.id}@import.local`,
            name: realName,
            passwordHash: hashPassword(password),
            title: 'Imported from Slack',
            avatarColor: colorFor(su.id),
            kind: 'human',
            role: 'member',
            externalId: su.id,
          },
        })
        userIdMap.set(su.id, created.id)
        mentionMap.set(su.id, { name: realName, handle: null })
        summary.usersCreated++
      } catch {
        summary.warnings.push(`Could not create user for Slack id ${su.id}`)
      }
    }
  }

  // ── 3. Channels: public (channels.json) + private (groups.json) ──────────
  type ChannelPlan = {
    slackId: string
    name: string
    kind: 'public' | 'private'
    created?: number
    topic: string | null
    members: string[]
    file: string
  }
  const plans: ChannelPlan[] = []

  const channelsJson = entry('channels.json')
  const groupsJson = entry('groups.json')

  const publicChannels = channelsJson
    ? (parseJson<SlackExportChannel[]>(channelsJson, 'channels.json', summary.warnings) ?? [])
    : []
  const privateChannels = groupsJson
    ? (parseJson<SlackExportChannel[]>(groupsJson, 'groups.json', summary.warnings) ?? [])
    : []

  const plan = (sc: SlackExportChannel, kind: 'public' | 'private') => {
    if (!sc.id || !sc.name) return
    plans.push({
      slackId: sc.id,
      name: sc.name,
      kind,
      created: sc.created,
      topic: sc.topic?.value || sc.purpose?.value || null,
      members: Array.isArray(sc.members) ? sc.members : [],
      file: `${sc.name}.json`,
    })
  }
  for (const c of publicChannels) plan(c, 'public')
  for (const g of privateChannels) plan(g, 'private')

  if (plans.length === 0) {
    summary.warnings.push('No channels found (channels.json / groups.json empty or missing)')
  }

  for (const planItem of plans) {
    // Idempotency: channel already imported on a previous run?
    const existing = await db.channel.findFirst({
      where: { orgId: actor.orgId, externalId: planItem.slackId },
      select: { id: true },
    })
    if (existing) {
      summary.channelsSkipped++
      continue
    }

    // Slug collisions with native channels get a suffix
    let slug = slugify(planItem.name) || `slack-${planItem.slackId.toLowerCase()}`
    const slugTaken = await db.channel.findFirst({ where: { orgId: actor.orgId, slug }, select: { id: true } })
    if (slugTaken) slug = `${slug}-slack`.slice(0, 60)

    const memberRows = [...new Set(planItem.members)]
      .map((suId) => userIdMap.get(suId))
      .filter((id): id is string => !!id)

    const channel = await db.channel.create({
      data: {
        orgId: actor.orgId,
        name: planItem.name,
        slug,
        topic: planItem.topic,
        kind: planItem.kind,
        externalId: planItem.slackId,
        createdBy: actor.id,
        createdAt: planItem.created ? new Date(planItem.created * 1000) : new Date(),
        members: {
          create: [
            // The importer joins so the channel is immediately visible to them
            { userId: actor.id, role: 'owner' },
            ...[...new Set(memberRows.filter((id) => id !== actor.id))].map((userId) => ({
              userId,
              role: 'member' as const,
            })),
          ],
        },
      },
    })
    summary.channelsImported++

    // ── 4. Messages for this channel ────────────────────────────────────────
    const messagesRaw = entry(planItem.file)
    if (!messagesRaw) {
      summary.warnings.push(`Message file ${planItem.file} not found for #${planItem.name}`)
      summary.channels.push({ name: planItem.name, kind: planItem.kind, messages: 0 })
      continue
    }
    const slackMessages = parseJson<SlackExportMessage[]>(messagesRaw, planItem.file, summary.warnings) ?? []
    // Oldest first — Slack exports are newest-first
    const ordered = [...slackMessages].sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0))

    // Existing imported messages in this channel (idempotent re-runs)
    const alreadyImported = await db.message.findMany({
      where: { channelId: channel.id, externalId: { not: null } },
      select: { externalId: true },
    })
    const existingTs = new Set(alreadyImported.map((m) => m.externalId!))

    /** Slack ts → our message id, for thread parents */
    const tsToId = new Map<string, string>()
    // Monotonic timestamp guard: SQLite Dates have ms precision; two Slack
    // messages within the same ms would tie and could reorder by id. Force
    // strictly increasing timestamps within the channel.
    let lastMs = 0
    let imported = 0

    // Mention candidates: fixed for this channel once members are created
    // (imported messages never re-notify — historical mentions just highlight)
    const memberCandidates = (
      await db.channelMember.findMany({
        where: { channelId: channel.id },
        include: { user: { include: { agent: { select: { handle: true } } } } },
      })
    ).map((m) => ({ id: m.user.id, name: m.user.name, handle: m.user.agent?.handle ?? null }))

    for (const sm of ordered) {
      if (!sm.ts || existingTs.has(sm.ts)) continue
      if (sm.deleted) continue
      // Only plain messages and thread replies import cleanly — every subtype
      // (join/leave, bot_message, file_share, tombstone,…) either duplicates
      // content or has no equivalent in our model.
      if (sm.subtype) {
        summary.messagesSkippedSubtype++
        continue
      }

      const date = tsToDate(sm.ts)
      if (!date) continue
      let ms = date.getTime()
      if (ms <= lastMs) ms = lastMs + 1
      lastMs = ms

      const senderId = sm.user ? (userIdMap.get(sm.user) ?? null) : null
      if (sm.user && !senderId) summary.missingSenderMessages++

      const text = slackTextToBody(sm.text ?? '', mentionMap)
      const withEmoji = inlineEmoji(text)
      const isThreadReply = !!sm.thread_ts && sm.thread_ts !== sm.ts

      const message = await db.message.create({
        data: {
          channelId: channel.id,
          senderId,
          body: withEmoji,
          parentId: isThreadReply ? (tsToId.get(sm.thread_ts!) ?? null) : null,
          isPinned: Array.isArray(sm.pinned_to) && sm.pinned_to.length > 0,
          externalId: sm.ts,
          createdAt: new Date(ms),
          mentions: JSON.stringify(parseMentions(withEmoji, memberCandidates)),
        },
      })
      tsToId.set(sm.ts, message.id)
      imported++
      summary.messagesImported++
      if (isThreadReply) summary.threadsImported++

      // Reactions (shortcode → char; skip unknown names and missing users)
      if (Array.isArray(sm.reactions)) {
        for (const r of sm.reactions) {
          const emoji = slackEmojiToChar(r.name)
          if (!emoji) continue
          for (const reactor of r.users ?? []) {
            const reactorId = userIdMap.get(reactor)
            if (!reactorId) continue
            await db.reaction
              .create({ data: { messageId: message.id, userId: reactorId, emoji } })
              .then(() => {
                summary.reactionsImported++
              })
              .catch(() => {
                // duplicate (shouldn't happen on a fresh message) — ignore
              })
          }
        }
      }
    }

    summary.channels.push({ name: planItem.name, kind: planItem.kind, messages: imported })
  }

  void writeAudit({
    orgId: actor.orgId,
    actorId: actor.id,
    action: 'slack.import',
    target: 'workspace export',
    meta: {
      usersMatched: summary.usersMatched,
      usersCreated: summary.usersCreated,
      channelsImported: summary.channelsImported,
      messagesImported: summary.messagesImported,
      threadsImported: summary.threadsImported,
      reactionsImported: summary.reactionsImported,
    },
  }).catch(() => {})

  return summary
}
