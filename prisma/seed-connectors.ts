// Connector seed — idempotent, safe to run on the live demo DB at any time.
// Adds three realistic connector connections (Google Calendar → #general,
// GitHub → #engineering, Google Drive → #design) with their bot "app" users,
// channel memberships, a few historical app messages, and audit entries.
// Run with: bun prisma/seed-connectors.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** timestamp N minutes ago */
const M = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)

async function main() {
  const org = await db.org.findFirst({ where: { slug: 'acme' } })
  if (!org) throw new Error('Org "acme" not found — run the main seed first')
  const sarah = await db.user.findFirst({ where: { email: 'sarah@acme.test' } })
  const marcus = await db.user.findFirst({ where: { email: 'marcus@acme.test' } })
  if (!sarah || !marcus) throw new Error('Seed users not found — run the main seed first')

  const channel = async (slug: string) => {
    const c = await db.channel.findFirst({ where: { orgId: org.id, slug } })
    if (!c) throw new Error(`Channel #${slug} not found`)
    return c
  }
  const general = await channel('general')
  const engineering = await channel('engineering')
  const design = await channel('design')

  /** find-or-create a connector bot "app" user */
  const ensureAppUser = async (id: string, name: string, category: string, color: string) => {
    const email = `${id}@apps.acme.test`
    const existing = await db.user.findFirst({ where: { orgId: org.id, email } })
    if (existing) return existing
    return db.user.create({
      data: {
        orgId: org.id,
        email,
        name,
        kind: 'app',
        role: 'member',
        title: `Connector · ${category}`,
        avatarColor: color,
        // App users never log in — a random unusable hash
        passwordHash: `app:${Math.random().toString(36).slice(2)}`,
        createdAt: M(2900),
      },
    })
  }

  const gcalApp = await ensureAppUser('google-calendar', 'Google Calendar', 'Google Workspace', '#1a73e8')
  const githubApp = await ensureAppUser('github', 'GitHub', 'Developer tools', '#24292f')
  const gdriveApp = await ensureAppUser('google-drive', 'Google Drive', 'Google Workspace', '#0f9d58')

  const join = (channelId: string, userId: string, at: Date) =>
    db.channelMember
      .upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId, role: 'member', notifyLevel: 'none', joinedAt: at },
        update: {},
      })
      .catch(() => {})

  const connect = async (args: {
    connectorId: string
    accountLabel: string
    channelId: string
    appUserId: string
    connectedById: string
    subs: Record<string, boolean>
    at: Date
  }) => {
    const existing = await db.connectorConnection.findFirst({
      where: { orgId: org.id, connectorId: args.connectorId, accountLabel: args.accountLabel },
    })
    if (existing) return existing
    await join(args.channelId, args.appUserId, args.at)
    return db.connectorConnection.create({
      data: {
        orgId: org.id,
        connectorId: args.connectorId,
        accountLabel: args.accountLabel,
        eventSubs: JSON.stringify(args.subs),
        channelId: args.channelId,
        appUserId: args.appUserId,
        connectedById: args.connectedById,
        status: 'connected',
        createdAt: args.at,
      },
    })
  }

  // ── 1. Google Calendar → #general (Sarah) ─────────────────────────────────
  const gcalConn = await connect({
    connectorId: 'google-calendar',
    accountLabel: 'sarah@acme.test',
    channelId: general.id,
    appUserId: gcalApp.id,
    connectedById: sarah.id,
    subs: { meeting_reminder: true, event_created: true, event_updated: true, event_cancelled: false },
    at: M(2880),
  })

  // ── 2. GitHub → #engineering (Marcus) ──────────────────────────────────────
  const githubConn = await connect({
    connectorId: 'github',
    accountLabel: 'acme-inc',
    channelId: engineering.id,
    appUserId: githubApp.id,
    connectedById: marcus.id,
    subs: { pr_opened: true, push: true, ci_failed: true, review_requested: true },
    at: M(2820),
  })

  // ── 3. Google Drive → #design (Sarah) ─────────────────────────────────────
  await connect({
    connectorId: 'google-drive',
    accountLabel: 'sarah@acme.test',
    channelId: design.id,
    appUserId: gdriveApp.id,
    connectedById: sarah.id,
    subs: { file_shared: true, comment_added: true, file_updated: true },
    at: M(2760),
  })

  // ── historical app messages (idempotent: skip if any connector msg exists) ─
  const alreadySeeded = await db.message.count({ where: { connectorId: { not: null } } })
  if (alreadySeeded === 0) {
    await db.message.createMany({
      data: [
        {
          channelId: engineering.id,
          senderId: githubApp.id,
          body: 'Marcus Reid opened pull request #482 “Fix thread pagination jump on fast scroll” (main ← fix/thread-scroll).',
          mentions: JSON.stringify({ userIds: [], specials: [] }),
          connectorId: 'github',
          connectorPayload: JSON.stringify({
            event: 'pr_opened',
            title: 'PR #482 opened: Fix thread pagination jump on fast scroll',
            fields: [
              { label: 'Branch', value: 'fix/thread-scroll → main' },
              { label: 'Reviews', value: '1 reviewer requested (Priya)' },
              { label: 'Checks', value: 'CI running · 12 files changed' },
            ],
            actions: [
              { label: 'Review PR', style: 'primary' },
              { label: 'Approve', style: 'default' },
            ],
          }),
          createdAt: M(185),
        },
        {
          channelId: engineering.id,
          senderId: githubApp.id,
          body: 'priya-patel pushed 3 commits to main: “release: v0.9.4 staging cut”.',
          mentions: JSON.stringify({ userIds: [], specials: [] }),
          connectorId: 'github',
          connectorPayload: JSON.stringify({
            event: 'push',
            title: 'New push to main',
            fields: [
              { label: 'Commits', value: '3 (release: v0.9.4 staging cut, chore: bump deps, fix: emoji cache)' },
              { label: 'By', value: 'priya-patel' },
            ],
          }),
          createdAt: M(96),
        },
        {
          channelId: general.id,
          senderId: gcalApp.id,
          body: 'Design sync starts in 15 minutes (Standup room + Meet link). Organized by Sarah Chen.',
          mentions: JSON.stringify({ userIds: [], specials: [] }),
          connectorId: 'google-calendar',
          connectorPayload: JSON.stringify({
            event: 'meeting_reminder',
            title: 'Design sync — starts in 15 minutes',
            fields: [
              { label: 'When', value: 'Today · 3:00 PM – 3:30 PM (Asia/Tehran)' },
              { label: 'Where', value: 'meet.google.com/abc-defg-hij' },
              { label: 'Organizer', value: 'Sarah Chen' },
            ],
            actions: [
              { label: 'Join meeting', style: 'primary' },
              { label: 'Respond', style: 'default' },
            ],
          }),
          createdAt: M(34),
        },
        {
          channelId: design.id,
          senderId: gdriveApp.id,
          body: 'Priya Patel shared the file “Q4 Brand Refresh.fig” with the Design team — you can comment.',
          mentions: JSON.stringify({ userIds: [], specials: [] }),
          connectorId: 'google-drive',
          connectorPayload: JSON.stringify({
            event: 'file_shared',
            title: 'Priya Patel shared “Q4 Brand Refresh.fig”',
            fields: [
              { label: 'Type', value: 'Figma design · 18.4 MB' },
              { label: 'Shared with', value: 'Design team (6 people)' },
            ],
            actions: [
              { label: 'Open in Drive', style: 'primary' },
              { label: 'Comment', style: 'default' },
            ],
          }),
          createdAt: M(122),
        },
      ],
    })
  }

  // ── audit entries ──────────────────────────────────────────────────────────
  const existingAudits = await db.auditLog.count({ where: { action: 'connector.connected' } })
  if (existingAudits === 0) {
    await db.auditLog.createMany({
      data: [
        {
          orgId: org.id,
          actorId: sarah.id,
          action: 'connector.connected',
          target: 'Google Calendar',
          meta: JSON.stringify({ connectorId: 'google-calendar', accountLabel: 'sarah@acme.test' }),
          createdAt: M(2880),
        },
        {
          orgId: org.id,
          actorId: marcus.id,
          action: 'connector.connected',
          target: 'GitHub',
          meta: JSON.stringify({ connectorId: 'github', accountLabel: 'acme-inc' }),
          createdAt: M(2820),
        },
        {
          orgId: org.id,
          actorId: sarah.id,
          action: 'connector.connected',
          target: 'Google Drive',
          meta: JSON.stringify({ connectorId: 'google-drive', accountLabel: 'sarah@acme.test' }),
          createdAt: M(2760),
        },
      ],
    })
  }

  const connections = await db.connectorConnection.count({ where: { orgId: org.id, status: 'connected' } })
  const appMessages = await db.message.count({ where: { connectorId: { not: null } } })
  console.log(`✅ Connector seed complete: ${connections} connections, ${appMessages} app messages (gcal=${gcalConn.accountLabel})`)
}

main()
  .catch((e) => {
    console.error('Connector seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
