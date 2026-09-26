// Cutover validation report — migration phase 3.
//
// After a Slack export has been imported (phase 1) and the workspace has been
// running in parallel (phase 2 — Slack bot compat API), the final step is
// cutting over. This module builds a validation report that compares what was
// imported against what now lives in the workspace:
//
//   • per-imported-channel fidelity: messages with a Slack externalId vs total,
//     threads, reactions, pins, member count, last activity;
//   • user mapping: matched / created / bot / unlinked (deleted Slack account);
//   • deep-link mapping samples: Slack channel id → this channel, Slack ts →
//     message id (for redirect stubs during cutover week);
//   • readiness checks + a 0–100 confidence score.
//
// The report is read-only — it never mutates data. Exported as JSON for the
// UI and as Markdown for the downloadable cutover sign-off document.
import { db } from '@/lib/db'

export type CutoverCheck = {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export type CutoverChannelRow = {
  channelId: string
  slackId: string | null
  name: string
  kind: string
  importedMessages: number
  totalMessages: number
  newSinceImport: number
  threads: number
  reactions: number
  pins: number
  members: number
  lastActivity: string | null
}

export type CutoverUserRow = {
  name: string
  email: string
  kind: string
  slackLinked: boolean
  messageCount: number
}

export type CutoverReport = {
  generatedAt: string
  importsFound: number
  lastImportAt: string | null
  totals: {
    importedChannels: number
    importedMessages: number
    importedThreads: number
    importedReactions: number
    linkedUsers: number
    unlinkedUsers: number
    botUsers: number
  }
  channels: CutoverChannelRow[]
  users: CutoverUserRow[]
  deepLinkSamples: { slack: string; ours: string; label: string }[]
  checks: CutoverCheck[]
  confidence: number
}

export function reportToMarkdown(report: CutoverReport): string {
  const pct = (n: number) => (n === 0 ? '—' : `${n}`)
  const lines: string[] = []

  lines.push(`# Cutover validation report — ${report.totals.importedChannels > 0 ? 'Flack Chat' : 'Flack Chat (no imports yet)'}`)
  lines.push('')
  lines.push(`Generated: ${new Date(report.generatedAt).toUTCString()}`)
  lines.push(`Import runs found: ${report.importsFound}${report.lastImportAt ? ` · last at ${new Date(report.lastImportAt).toUTCString()}` : ''}`)
  lines.push('')
  lines.push(`**Confidence score: ${report.confidence}/100**`)
  lines.push('')

  lines.push('## Totals')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Imported channels | ${report.totals.importedChannels} |`)
  lines.push(`| Imported messages (linked to Slack ts) | ${report.totals.importedMessages} |`)
  lines.push(`| Imported threads | ${report.totals.importedThreads} |`)
  lines.push(`| Imported reactions | ${report.totals.importedReactions} |`)
  lines.push(`| Slack-linked users | ${report.totals.linkedUsers} |`)
  lines.push(`| Unlinked users (deleted Slack accounts) | ${report.totals.unlinkedUsers} |`)
  lines.push(`| Imported bot users | ${report.totals.botUsers} |`)
  lines.push('')

  lines.push('## Channel fidelity')
  lines.push('')
  lines.push('| Channel | Slack id | Imported | Total now | New since import | Threads | Reactions | Pinned | Members | Last activity |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const c of report.channels) {
    lines.push(
      `| ${c.kind === 'public' || c.kind === 'private' ? `#${c.name}` : c.name} | ${c.slackId ?? '—'} | ${pct(c.importedMessages)} | ${c.totalMessages} | ${c.newSinceImport} | ${c.threads} | ${c.reactions} | ${c.pins} | ${c.members} | ${c.lastActivity ? new Date(c.lastActivity).toUTCString() : 'never'} |`,
    )
  }
  lines.push('')

  lines.push('## User mapping')
  lines.push('')
  lines.push('| User | Email | Kind | Slack link | Messages |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const u of report.users) {
    lines.push(`| ${u.name} | ${u.email} | ${u.kind} | ${u.slackLinked ? 'linked' : '—'} | ${u.messageCount} |`)
  }
  lines.push('')

  lines.push('## Deep-link mapping samples')
  lines.push('')
  lines.push('Use these during cutover week to redirect old Slack links.')
  lines.push('')
  for (const link of report.deepLinkSamples) {
    lines.push(`- ${link.label}: \`${link.slack}\` → \`${link.ours}\``)
  }
  lines.push('')

  lines.push('## Readiness checks')
  lines.push('')
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'
    lines.push(`- ${icon} **${check.label}** — ${check.detail}`)
  }
  lines.push('')

  return lines.join('\n')
}

// ─── Report builder ──────────────────────────────────────────────────────────

export async function buildCutoverReport(orgId: string): Promise<CutoverReport> {
  // Import history from the audit log (phase-1 evidence)
  const importRuns = await db.auditLog.findMany({
    where: { orgId, action: 'slack.import' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, meta: true },
  })

  const importDates = importRuns.map((r) => r.createdAt)

  // Imported channels carry externalId (Slack "C…" id)
  const importedChannels = await db.channel.findMany({
    where: { orgId, externalId: { not: null } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      externalId: true,
      name: true,
      kind: true,
      createdAt: true,
      members: { select: { userId: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  })

  const channelIds = importedChannels.map((c) => c.id)

  // Aggregate message stats per imported channel in one pass each (small N)
  const channelRows: CutoverChannelRow[] = []
  let totalImported = 0
  let totalImportedThreads = 0
  let totalImportedReactions = 0

  for (const channel of importedChannels) {
    const [withExternal, all, threads, pins, reactions] = await Promise.all([
      db.message.count({ where: { channelId: channel.id, externalId: { not: null } } }),
      db.message.count({ where: { channelId: channel.id } }),
      db.message.count({ where: { channelId: channel.id, parentId: { not: null } } }),
      db.message.count({ where: { channelId: channel.id, isPinned: true } }),
      db.reaction.count({ where: { message: { channelId: channel.id } } }),
    ])
    totalImported += withExternal
    totalImportedThreads += threads
    totalImportedReactions += reactions
    channelRows.push({
      channelId: channel.id,
      slackId: channel.externalId,
      name: channel.name,
      kind: channel.kind,
      importedMessages: withExternal,
      totalMessages: all,
      newSinceImport: Math.max(0, all - withExternal),
      threads,
      reactions,
      pins,
      members: channel.members.length,
      lastActivity: channel.messages[0]?.createdAt?.toISOString() ?? null,
    })
  }

  // User mapping: externalId set = Slack-linked
  const users = await db.user.findMany({
    where: { orgId },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: {
      name: true,
      email: true,
      kind: true,
      externalId: true,
      isActive: true,
      _count: { select: { messages: true } },
    },
  })

  const userRows: CutoverUserRow[] = users.map((u) => ({
    name: u.name,
    email: u.email,
    kind: u.kind,
    slackLinked: !!u.externalId,
    messageCount: u._count.messages,
  }))

  const linkedUsers = userRows.filter((u) => u.slackLinked).length
  const unlinkedUsers = userRows.filter((u) => u.kind === 'human' && !u.slackLinked).length
  const botUsers = userRows.filter((u) => u.name.includes('(Slack bot)')).length

  // Deep-link samples: first pinned + first imported message of up to 3 channels
  const deepLinkSamples: CutoverReport['deepLinkSamples'] = []
  for (const channel of importedChannels.slice(0, 3)) {
    const message = await db.message.findFirst({
      where: { channelId: channel.id, externalId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, externalId: true, parentId: true },
    })
    if (message?.externalId) {
      deepLinkSamples.push({
        slack: `slack://channel?id=${channel.externalId}&message_ts=${message.externalId}`,
        ours: `/#/channel/${channel.id}/message/${message.id}`,
        label: `#${channel.name} — first imported message`,
      })
    }
  }

  // Readiness checks
  const checks: CutoverCheck[] = []

  const anyImported = importedChannels.length > 0
  checks.push(
    anyImported
      ? {
          id: 'has-import',
          label: 'Historical import present',
          status: 'pass',
          detail: `${importedChannels.length} imported channel(s) found, ${totalImported} message(s) carrying Slack external ids.`,
        }
      : {
          id: 'has-import',
          label: 'Historical import present',
          status: 'warn',
          detail: 'No imported channels yet — run a Slack export import (phase 1) before cutover validation.',
        },
  )

  const emptyChannels = channelRows.filter((c) => c.totalMessages === 0)
  checks.push({
    id: 'channels-nonempty',
    label: 'No empty imported channels',
    status: emptyChannels.length === 0 ? 'pass' : 'warn',
    detail:
      emptyChannels.length === 0
        ? 'Every imported channel has messages.'
        : `${emptyChannels.length} imported channel(s) have no messages (${emptyChannels.map((c) => `#${c.name}`).join(', ')}).`,
  })

  const missingSender = await db.message.count({
    where: { channelId: { in: channelIds }, senderId: null, parentId: null, deletedAt: null },
  })
  checks.push({
    id: 'attribution',
    label: 'Message attribution intact',
    status: missingSender === 0 ? 'pass' : 'warn',
    detail:
      missingSender === 0
        ? 'Every imported top-level message has an author.'
        : `${missingSender} imported message(s) have no author (deleted Slack account) — they show as "Unknown".`,
  })

  const activeSince = await db.message.count({
    where: { channelId: { in: channelIds }, createdAt: { gt: importDates[0] ?? new Date(0) }, externalId: null },
  })
  checks.push({
    id: 'parallel-usage',
    label: 'Parallel-run activity detected',
    status: activeSince > 0 ? 'pass' : 'warn',
    detail:
      activeSince > 0
        ? `${activeSince} new message(s) posted in imported channels since the import — the team is using the workspace.`
        : 'No new messages in imported channels since the import. Encourage parallel usage before cutover.',
  })

  const unlinkedHumans = unlinkedUsers
  checks.push({
    id: 'user-mapping',
    label: 'User mapping complete',
    status: unlinkedHumans === 0 ? 'pass' : 'warn',
    detail:
      unlinkedHumans === 0
        ? 'All human users are linked to Slack accounts.'
        : `${unlinkedHumans} human user(s) have no Slack link (never imported or created locally).`,
  })

  const dmCoverage: CutoverCheck = {
    id: 'dm-scope',
    label: 'DM history scope understood',
    status: 'warn',
    detail: 'Slack exports exclude DM/mpim history — direct messages stayed in Slack. Confirm the team accepts this before cutover.',
  }
  checks.push(dmCoverage)

  const recentMcp = await db.auditLog.count({
    where: { orgId, action: 'mcp.tool_call', createdAt: { gt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
  })
  const slackCompat = await db.auditLog.count({
    where: { orgId, action: { startsWith: 'slack.api.' }, createdAt: { gt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
  })
  checks.push({
    id: 'integrations-live',
    label: 'Integrations active in the last 7 days',
    status: recentMcp + slackCompat > 0 ? 'pass' : 'warn',
    detail:
      recentMcp + slackCompat > 0
        ? `${recentMcp} MCP tool call(s) and ${slackCompat} Slack-compat API call(s) in the last 7 days — external clients are connected.`
        : 'No MCP or Slack-compat API traffic in the last 7 days. Verify bots/agents are pointed at this workspace.',
  })

  // Confidence: weighted — import presence (30), non-empty channels (15),
  // attribution (15), parallel usage (20), user mapping (10), integrations (10)
  let score = 0
  for (const check of checks) {
    if (check.id === 'dm-scope') continue
    const weight =
      check.id === 'has-import' ? 30 : check.id === 'parallel-usage' ? 20 : check.id === 'channels-nonempty' ? 15 : check.id === 'attribution' ? 15 : check.id === 'user-mapping' ? 10 : 10
    if (check.status === 'pass') score += weight
  }
  score = Math.min(100, Math.round(score))

  return {
    generatedAt: new Date().toISOString(),
    importsFound: importRuns.length,
    lastImportAt: importRuns[0]?.createdAt?.toISOString() ?? null,
    totals: {
      importedChannels: importedChannels.length,
      importedMessages: totalImported,
      importedThreads: totalImportedThreads,
      importedReactions: totalImportedReactions,
      linkedUsers,
      unlinkedUsers,
      botUsers,
    },
    channels: channelRows,
    users: userRows,
    deepLinkSamples,
    checks,
    confidence: score,
  }
}
