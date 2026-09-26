// Seed script: populates the workspace with a realistic demo org.
// Run with: bun prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

const DEMO_PASSWORD = 'demo1234'

function hash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

/** timestamp N minutes ago */
const M = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)

const mentionJson = (userIds: string[], specials: string[] = []) =>
  JSON.stringify({ userIds, specials })

async function main() {
  console.log('🌱 Seeding demo workspace…')

  // ── wipe (FK order) ────────────────────────────────────────────────────────
  await db.notification.deleteMany()
  await db.workflowRun.deleteMany()
  await db.workflow.deleteMany()
  await db.agent.deleteMany()
  await db.reaction.deleteMany()
  await db.file.deleteMany()
  await db.message.deleteMany()
  await db.channelMember.deleteMany()
  await db.channel.deleteMany()
  await db.session.deleteMany()
  await db.auditLog.deleteMany()
  await db.user.deleteMany()
  await db.org.deleteMany()

  // ── org ────────────────────────────────────────────────────────────────────
  const org = await db.org.create({
    data: { name: 'Flack Inc', slug: 'flack', plan: 'team' },
  })

  // ── humans ─────────────────────────────────────────────────────────────────
  const mkUser = (data: Record<string, unknown>) =>
    db.user.create({ data: { ...data, orgId: org.id, passwordHash: hash(DEMO_PASSWORD) } as any })

  const sarah = await mkUser({
    email: 'sarah@flack.test',
    name: 'Sarah Chen',
    title: 'Product Lead',
    role: 'owner',
    avatarColor: '#e11d48',
    timezone: 'America/Los_Angeles',
    statusEmoji: '🎯',
    statusText: 'Heads down on v1 launch',
  })
  const marcus = await mkUser({
    email: 'marcus@flack.test',
    name: 'Marcus Johnson',
    title: 'Engineering Manager',
    role: 'admin',
    avatarColor: '#ea580c',
    statusEmoji: '☕',
    statusText: 'Brewing ideas',
  })
  const priya = await mkUser({
    email: 'priya@flack.test',
    name: 'Priya Patel',
    title: 'Senior Engineer',
    role: 'member',
    avatarColor: '#059669',
  })
  const diego = await mkUser({
    email: 'diego@flack.test',
    name: 'Diego Ramirez',
    title: 'Product Designer',
    role: 'member',
    avatarColor: '#d97706',
    statusEmoji: '🎨',
    statusText: 'Figma deep-dive',
  })
  const emma = await mkUser({
    email: 'emma@flack.test',
    name: 'Emma Wilson',
    title: 'Marketing Lead',
    role: 'member',
    avatarColor: '#db2777',
  })
  const tom = await mkUser({
    email: 'tom@flack.test',
    name: 'Tom Okafor',
    title: 'Account Executive',
    role: 'member',
    avatarColor: '#0d9488',
  })

  // ── agents (as first-class users) ──────────────────────────────────────────
  const ariaUser = await mkUser({
    email: 'aria@flack.test',
    name: 'Aria',
    title: 'AI Team Assistant',
    kind: 'agent',
    avatarColor: '#c026d3',
  })
  const reviewerUser = await mkUser({
    email: 'reviewer@flack.test',
    name: 'CodeReviewer',
    title: 'AI Code Review Agent',
    kind: 'agent',
    avatarColor: '#65a30d',
  })

  const aria = await db.agent.create({
    data: {
      orgId: org.id,
      userId: ariaUser.id,
      handle: 'aria',
      description: 'Friendly team assistant — answers questions, summarizes threads, drafts content.',
      systemPrompt:
        'You are Aria, the AI team assistant for Flack Inc. You live in the team chat. ' +
        'Be helpful, warm and concise (under 120 words unless asked for more). ' +
        'Use Markdown formatting when useful. If you do not know something, say so honestly.',
      chatable: true,
      model: 'glm-4',
      rateLimitPerHour: 30,
      tools: JSON.stringify(['post_message', 'read_channel', 'search']),
    },
  })
  await db.agent.create({
    data: {
      orgId: org.id,
      userId: reviewerUser.id,
      handle: 'reviewer',
      description: 'Reviews pasted code for bugs, style and security issues.',
      systemPrompt:
        'You are CodeReviewer, an expert code review agent for Flack Inc. When shown code, ' +
        'review it: bugs first, then security, then style. Be specific and reference line content. ' +
        'Keep reviews tight — max ~150 words plus code snippets.',
      chatable: true,
      model: 'glm-4',
      rateLimitPerHour: 20,
      tools: JSON.stringify(['post_message']),
    },
  })

  // ── channels ───────────────────────────────────────────────────────────────
  const mkChannel = (data: Record<string, unknown>) =>
    db.channel.create({ data: { ...data, orgId: org.id } as any })

  const general = await mkChannel({
    name: 'general',
    slug: 'general',
    kind: 'public',
    isDefault: true,
    topic: 'Company-wide announcements and water-cooler chat',
    createdBy: sarah.id,
  })
  const random = await mkChannel({
    name: 'random',
    slug: 'random',
    kind: 'public',
    isDefault: true,
    topic: 'Non-work banter 🎉',
    createdBy: sarah.id,
  })
  const engineering = await mkChannel({
    name: 'engineering',
    slug: 'engineering',
    kind: 'public',
    topic: 'Builds, deploys, incidents, architecture',
    createdBy: marcus.id,
  })
  const design = await mkChannel({
    name: 'design',
    slug: 'design',
    kind: 'public',
    topic: 'Design reviews and UX research',
    createdBy: diego.id,
  })
  const launch = await mkChannel({
    name: 'launch-plan',
    slug: 'launch-plan',
    kind: 'private',
    topic: 'V1 launch — private working group',
    createdBy: sarah.id,
  })

  const dmSlug = (a: string, b: string) => `dm-${[a, b].sort().join('-')}`
  const dmSarahMarcus = await mkChannel({
    name: 'Sarah Chen, Marcus Johnson',
    slug: dmSlug(sarah.id, marcus.id),
    kind: 'dm',
    createdBy: sarah.id,
  })
  const dmSarahAria = await mkChannel({
    name: 'Aria',
    slug: dmSlug(sarah.id, ariaUser.id),
    kind: 'dm',
    createdBy: sarah.id,
  })
  const dmPriyaDiego = await mkChannel({
    name: 'Priya Patel, Diego Ramirez',
    slug: dmSlug(priya.id, diego.id),
    kind: 'dm',
    createdBy: priya.id,
  })
  const gdmIncident = await mkChannel({
    name: 'Sarah Chen, Marcus Johnson, Priya Patel',
    slug: `gdm-${[sarah.id, marcus.id, priya.id].sort().join('-')}`,
    kind: 'group_dm',
    createdBy: marcus.id,
  })

  const join = (channelId: string, userIds: string[]) =>
    db.channelMember.createMany({
      data: userIds.map((userId) => ({ channelId, userId })),
    })

  await join(general.id, [sarah.id, marcus.id, priya.id, diego.id, emma.id, tom.id, ariaUser.id, reviewerUser.id])
  await join(random.id, [sarah.id, marcus.id, priya.id, diego.id, emma.id, tom.id, ariaUser.id])
  await join(engineering.id, [sarah.id, marcus.id, priya.id, diego.id, ariaUser.id, reviewerUser.id])
  await join(design.id, [sarah.id, diego.id, priya.id, emma.id])
  await join(launch.id, [sarah.id, marcus.id, emma.id, tom.id])
  await join(dmSarahMarcus.id, [sarah.id, marcus.id])
  await join(dmSarahAria.id, [sarah.id, ariaUser.id])
  await join(dmPriyaDiego.id, [priya.id, diego.id])
  await join(gdmIncident.id, [sarah.id, marcus.id, priya.id])

  // ── messages ───────────────────────────────────────────────────────────────
  let seq = 0
  const msg = async (
    channelId: string,
    senderId: string | null,
    body: string,
    minutesAgo: number,
    extra: {
      mentions?: string[]
      specials?: string[]
      parentId?: string
      pinned?: boolean
      edited?: boolean
    } = {},
  ) => {
    seq += 1
    const createdAt = M(minutesAgo)
    return db.message.create({
      data: {
        id: `msg_seed_${String(seq).padStart(3, '0')}`,
        channelId,
        senderId,
        body,
        createdAt,
        updatedAt: createdAt,
        mentions: mentionJson(extra.mentions ?? [], extra.specials ?? []),
        parentId: extra.parentId,
        isPinned: extra.pinned ?? false,
        editedAt: extra.edited ? M(minutesAgo - 3) : null,
      },
    })
  }
  const react = (messageId: string, emoji: string, userIds: string[]) =>
    db.reaction.createMany({
      data: userIds.map((userId) => ({ messageId, userId, emoji })),
    })

  // Day -2 ─ general
  await msg(general.id, sarah.id, 'Morning everyone! 👋 Big week ahead — v1 launch planning kicks off today.', 2980)
  const m1 = await msg(general.id, marcus.id, 'Good morning! Coffee first, strategy second ☕', 2975)
  await react(m1.id, '☕', [sarah.id, priya.id])
  await msg(
    general.id,
    sarah.id,
    'Reminder: **company all-hands** this Friday at 4pm PT. Agenda in comments — bring questions!',
    2970,
    { pinned: true },
  )

  // Day -2 ─ engineering with code block + thread
  await msg(engineering.id, priya.id, 'Working on the realtime gateway refactor. Rate limiter middleware now looks like this:', 2930)
  await msg(
    engineering.id,
    priya.id,
    '```ts\nconst limiter = new RateLimiter({\n  windowMs: 60_000,\n  max: 100,\n  keyGenerator: (req) => req.user.id,\n});\n\napp.use("/api", (req, res, next) => {\n  if (!limiter.tryConsume(req)) {\n    return res.status(429).json({ error: "rate_limited" });\n  }\n  next();\n});\n```',
    2929,
  )
  const t1 = await msg(engineering.id, marcus.id, 'Nice. Should we also add jitter to the window reset? Last time we saw thundering-herd retries.', 2925)
  const t1r1 = await msg(engineering.id, priya.id, 'Good catch — I will add ±10% jitter so retries spread out.', 2920, { parentId: t1.id })
  const t1r2 = await msg(engineering.id, marcus.id, 'Perfect. Once that is in, let us load-test with 500 concurrent sockets.', 2918, { parentId: t1.id })
  await msg(engineering.id, ariaUser.id, 'I can summarize load-test results if you paste them here. Just `@aria summarize` in the thread :wink:', 2915, { parentId: t1.id })
  await react(t1r1.id, '👍', [marcus.id])
  await react(t1.id, '🧵', [priya.id])

  // Day -1 ─ design
  await msg(design.id, diego.id, 'New onboarding flow mockups are up. Three screens, progressive disclosure, zero jargon.', 1550)
  const m2 = await msg(design.id, diego.id, 'Main decision point: do we ask for workspace name *before* or *after* invite teammates?', 1545)
  await react(m2.id, '🤔', [sarah.id, emma.id])
  await msg(design.id, priya.id, 'After. Fewer fields on first screen = better activation. We can default the workspace name from email domain.', 1530)
  await msg(design.id, diego.id, 'Agreed. Updating the prototype tonight.', 1525)
  const m3 = await msg(design.id, emma.id, '@Sarah Chen — we should align this with the launch messaging. Can you review before Thursday?', 600, { mentions: [sarah.id] })
  await react(m3.id, '👀', [diego.id])

  // Day -1 ─ random
  await msg(random.id, tom.id, 'Anyone else watching the game last night? What a finish 🏀', 1500)
  const m4 = await msg(random.id, marcus.id, 'I turned it off with 2 minutes left. Never again.', 1495)
  await react(m4.id, '😂', [tom.id, priya.id, sarah.id])
  await msg(random.id, priya.id, 'The officiating was… interesting. Anyway, back to shipping :sweat_smile:', 1490)
  await msg(random.id, emma.id, 'Trivia night at the office Thursday 6pm — teams of 4, prize is bragging rights 🏆', 700)

  // Day -1 ─ launch-plan (private)
  await msg(launch.id, sarah.id, 'Launch checklist v0.9 is in the doc. Biggest risks: onboarding drop-off and email deliverability.', 1480)
  await msg(launch.id, tom.id, 'I have 3 pilot customers lined up for the first week. They want SSO but can live without it for the pilot.', 1470)
  await msg(launch.id, emma.id, 'Press embargo lifts on the 12th. Draft announcement is ready for review.', 1465)
  await msg(launch.id, marcus.id, 'Engineering is 80% confident for the 10th. Holding one day of buffer for the migration tool.', 1460, { edited: true })

  // Today ─ general standup
  await msg(general.id, sarah.id, '☀️ Good morning! Quick async standup — drop your focus for today when you can.', 260)
  await msg(general.id, priya.id, 'Finishing the websocket reconnect logic + writing the catch-up endpoint. PM: code review by noon.', 250)
  const m5 = await msg(general.id, diego.id, 'Onboarding v2 prototype → user testing at 2pm. @Marcus Johnson can you join for eng feasibility questions?', 240, { mentions: [marcus.id] })
  await react(m5.id, '🙌', [sarah.id, marcus.id])
  await msg(general.id, tom.id, 'Customer calls until 1pm, then pilot onboarding docs.', 235)
  await msg(general.id, marcus.id, 'On it Diego 👍 Also: 1:1s moved to Friday.', 230)

  // Today ─ sarah asks aria in general (seeded reply shows agent behavior)
  const q1 = await msg(general.id, sarah.id, '@aria what is on the launch checklist that still has no owner?', 200, { mentions: [ariaUser.id] })
  await react(q1.id, '🤖', [marcus.id, diego.id])
  await msg(
    general.id,
    ariaUser.id,
    "Looking at the launch channel, three items are still unowned:\n\n1. **Migration dry-run** — full rehearsal importing a real workspace export\n2. **Support runbook** — first-response templates + escalation paths\n3. **Post-launch metrics dashboard** — signup funnel + retention baseline\n\nWant me to draft the support runbook? :seedling:",
    199,
    { parentId: q1.id },
  )

  // Today ─ engineering deploy
  const m6 = await msg(engineering.id, priya.id, 'deployed v0.9.3 to staging 🚀 — reconnect logic + missed-message catch-up is live. Notes in the changelog.', 120)
  await react(m6.id, '🎉', [sarah.id, marcus.id, diego.id])
  await react(m6.id, '🚀', [marcus.id, tom.id])
  await msg(engineering.id, marcus.id, 'Beautiful. Running the smoke suite against staging now.', 110)
  await msg(
    engineering.id,
    reviewerUser.id,
    'Smoke suite green ✅ — 42/42 checks passed. Two flaky tests quarantined (timeouts under load). Full report attached to the run.',
    105,
  )
  const m7 = await msg(engineering.id, priya.id, 'Reviewer agent is getting scarily reliable. @Marcus Johnson can we promote it to required-check on PRs?', 100, { mentions: [marcus.id] })

  // Today ─ group DM incident
  await msg(gdmIncident.id, marcus.id, 'Heads up — seeing elevated 5xx on the ingestion API (0.4% of requests). Not user-facing yet.', 80)
  await msg(gdmIncident.id, priya.id, 'On it. Looks like the connection pool is exhausted — a worker is holding connections open.', 75)
  await msg(gdmIncident.id, sarah.id, 'Keep me posted. If it degrades, we page.', 70)
  await msg(gdmIncident.id, priya.id, 'Fix is deploying. Pool config was wrong after the refactor — classic.', 30)

  // Today ─ DM sarah↔marcus
  await msg(dmSarahMarcus.id, sarah.id, 'Do you think we make the 10th? Be brutally honest :slightly_smiling_face:', 90)
  await msg(dmSarahMarcus.id, marcus.id, 'If the pool fix holds and migration dry-run goes clean — yes. I would move the *public* announcement to the 12th though, one day of buffer for hotfixes.', 85)
  await msg(dmSarahMarcus.id, sarah.id, 'Agreed. I will sync with Emma.', 83)

  // Today ─ DM sarah↔aria
  await msg(dmSarahAria.id, sarah.id, 'Morning Aria — can you give me a one-paragraph status summary of the launch risks?', 55)
  await msg(
    dmSarahAria.id,
    ariaUser.id,
    '**Launch risk snapshot:** Engineering is on track for the 10th with one buffer day. Top risks are (1) onboarding drop-off — mitigated by the new v2 flow in testing today, (2) email deliverability — Emma owns a warm-up plan, and (3) the migration dry-run has no owner yet. Ingestion 5xx blip this morning is contained. Overall: *amber-green* :traffic_light:',
    54,
  )

  // Today ─ DM priya↔diego
  await msg(dmPriyaDiego.id, diego.id, 'Sent you the prototype link — check screen 2, I tried your progressive disclosure idea.', 45)
  await msg(dmPriyaDiego.id, priya.id, 'Ooh this is nice. The empty-state copy could be warmer though. "Let’s get you started" beats "No data".', 40)

  // Today ─ random unread for sarah
  await msg(random.id, tom.id, 'Found the old office arcade cabinet in storage. Restoring it for the launch party 🕹️', 35)
  const m8 = await msg(random.id, emma.id, 'This is the best idea anyone has had all quarter.', 30)
  await react(m8.id, '🕹️', [tom.id, priya.id, marcus.id])
  await react(m8.id, '🔥', [diego.id])

  // ── mark read states (leave some unread for a lively first login) ─────────
  const setLastRead = async (channelId: string, userId: string, messageId: string | null) => {
    await db.channelMember.updateMany({
      where: { channelId, userId },
      data: { lastReadMessageId: messageId },
    })
  }
  // Sarah: read everything except #random and #design
  await setLastRead(general.id, sarah.id, 'msg_seed_021')
  await setLastRead(engineering.id, sarah.id, 'msg_seed_026')
  await setLastRead(launch.id, sarah.id, 'msg_seed_016')
  await setLastRead(dmSarahMarcus.id, sarah.id, 'msg_seed_028')
  await setLastRead(dmSarahAria.id, sarah.id, 'msg_seed_030')
  await setLastRead(gdmIncident.id, sarah.id, 'msg_seed_033')
  await setLastRead(random.id, sarah.id, 'msg_seed_013') // 2 unread
  await setLastRead(design.id, sarah.id, 'msg_seed_010') // emma mention unread
  // Others roughly caught up
  for (const u of [marcus.id, priya.id, diego.id, emma.id, tom.id]) {
    for (const c of [general.id, random.id, engineering.id, design.id, launch.id]) {
      await setLastRead(c, u, null).catch(() => {})
    }
  }
  await db.channelMember.updateMany({ where: { channelId: engineering.id }, data: { lastReadMessageId: 'msg_seed_027' } })
  await db.channelMember.updateMany({ where: { channelId: random.id, userId: marcus.id }, data: { lastReadMessageId: 'msg_seed_034' } })

  // ── notifications for sarah ────────────────────────────────────────────────
  await db.notification.createMany({
    data: [
      {
        userId: sarah.id,
        type: 'mention',
        channelId: design.id,
        messageId: m3.id,
        actorId: emma.id,
        body: 'Emma Wilson mentioned you in #design',
        createdAt: M(600),
      },
      {
        userId: sarah.id,
        type: 'mention',
        channelId: engineering.id,
        messageId: m7.id,
        actorId: priya.id,
        body: 'Priya Patel mentioned you in #engineering',
        createdAt: M(100),
      },
      {
        userId: marcus.id,
        type: 'mention',
        channelId: general.id,
        messageId: m5.id,
        actorId: diego.id,
        body: 'Diego Ramirez mentioned you in #general',
        createdAt: M(240),
      },
    ],
  })

  // ── workflows ──────────────────────────────────────────────────────────────
  const wf1 = await db.workflow.create({
    data: {
      orgId: org.id,
      name: 'Celebrate deploys 🎉',
      description: 'When someone posts "deployed" in #engineering, react 🎉 and cheer.',
      triggerType: 'message_posted',
      triggerConfig: JSON.stringify({ channelId: engineering.id, keyword: 'deployed' }),
      steps: JSON.stringify([
        {
          id: 'step-react',
          type: 'add_reaction',
          label: 'React 🎉 on the deploy message',
          config: { emoji: '🎉', targetTriggerMessage: true },
        },
        {
          id: 'step-cheer',
          type: 'post_message',
          label: 'Cheer in #engineering',
          config: { channelId: engineering.id, body: 'Ship it! Congrats on the deploy 🚀 🎉' },
        },
      ]),
      createdBy: marcus.id,
    },
  })
  await db.workflow.create({
    data: {
      orgId: org.id,
      name: 'Recap on ✅',
      description: 'When someone reacts ✅ to a message, ask Aria to post a one-line recap.',
      triggerType: 'reaction',
      triggerConfig: JSON.stringify({ emoji: '✅' }),
      steps: JSON.stringify([
        {
          id: 'step-recap',
          type: 'run_agent',
          label: 'Aria posts a recap',
          config: {
            agentId: aria.id,
            channelId: engineering.id,
            prompt:
              'A message in the team chat just got approved with a ✅ reaction. Post a single upbeat sentence celebrating the milestone, referencing what was approved.',
          },
        },
      ]),
      createdBy: sarah.id,
    },
  })
  await db.workflow.create({
    data: {
      orgId: org.id,
      name: 'Daily welcome wave 👋',
      description: 'Manual workflow — posts a friendly hello in #general.',
      triggerType: 'button',
      triggerConfig: JSON.stringify({}),
      steps: JSON.stringify([
        {
          id: 'step-hello',
          type: 'post_message',
          label: 'Say hello in #general',
          config: { channelId: general.id, body: 'Hello team! 👋 New day, new wins. Drop your focus in the thread!' },
        },
      ]),
      createdBy: sarah.id,
    },
  })
  await db.workflowRun.create({
    data: {
      workflowId: wf1.id,
      status: 'done',
      triggerLabel: 'Priya Patel posted “deployed v0.9.3 to staging 🚀” in #engineering',
      logs: JSON.stringify([
        { step: 'add_reaction', label: 'React 🎉 on the deploy message', status: 'ok', at: M(119).toISOString() },
        { step: 'post_message', label: 'Cheer in #engineering', status: 'ok', detail: 'Message posted', at: M(119).toISOString() },
      ]),
      startedAt: M(120),
      finishedAt: M(119),
    },
  })

  // ── audit log entries ──────────────────────────────────────────────────────
  await db.auditLog.createMany({
    data: [
      {
        orgId: org.id,
        actorId: sarah.id,
        action: 'workspace.created',
        target: org.name,
        createdAt: M(3000),
      },
      {
        orgId: org.id,
        actorId: sarah.id,
        action: 'agent.created',
        target: '@aria',
        meta: JSON.stringify({ chatable: true }),
        createdAt: M(2500),
      },
      {
        orgId: org.id,
        actorId: marcus.id,
        action: 'workflow.created',
        target: 'Celebrate deploys 🎉',
        createdAt: M(400),
      },
    ],
  })

  const counts = {
    users: await db.user.count(),
    agents: await db.agent.count(),
    channels: await db.channel.count(),
    messages: await db.message.count(),
    reactions: await db.reaction.count(),
    workflows: await db.workflow.count(),
  }
  console.log('✅ Seed complete:', counts, `(password: ${DEMO_PASSWORD})`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
