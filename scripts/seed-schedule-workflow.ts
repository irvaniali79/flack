// One-off seed: "Daily engineering pulse 💓" — demo scheduled (cron) workflow.
// Runs directly against the DB (bun scripts/seed-schedule-workflow.ts).
// nextRunAt is set ~75s out so the demo demonstrably fires via the scheduler
// tick; afterwards the engine advances it to the next 09:00 occurrence.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const WORKFLOW_NAME = 'Daily engineering pulse 💓'

async function main() {
  const sarah = await db.user.findUnique({ where: { email: 'sarah@flack.test' } })
  if (!sarah) throw new Error('sarah@flack.test not found')
  const engineering = await db.channel.findFirst({
    where: { orgId: sarah.orgId, slug: { startsWith: 'engineering' } },
  })
  if (!engineering) throw new Error('#engineering channel not found')
  const aria = await db.agent.findFirst({ where: { handle: 'aria' } })
  if (!aria) throw new Error('@aria agent not found')

  // Idempotent: replace any previous seed of this workflow.
  await db.workflow.deleteMany({ where: { name: WORKFLOW_NAME } })

  const steps = [
    {
      id: crypto.randomUUID(),
      type: 'post_message',
      label: 'Morning pulse post',
      config: {
        channelId: engineering.id,
        body:
          '☀️ **Daily engineering pulse** — good morning, team! ' +
          'A fresh day to ship great things. Drop your focus for today below 👇 and keep the momentum going. 💓',
      },
    },
    {
      id: crypto.randomUUID(),
      type: 'run_agent',
      label: 'Aria standup prompt',
      config: {
        agentId: aria.id,
        channelId: engineering.id,
        prompt: 'Post a one-sentence motivational standup prompt for the engineering team.',
      },
    },
  ]

  const workflow = await db.workflow.create({
    data: {
      orgId: sarah.orgId,
      name: WORKFLOW_NAME,
      description: 'Every day at 09:00 — a morning pulse post + an @aria standup prompt in #engineering.',
      triggerType: 'schedule',
      // Demo: first fire ~75s from now so the scheduler demonstrably fires it.
      triggerConfig: JSON.stringify({
        scheduleKind: 'daily',
        time: '09:00',
        nextRunAt: new Date(Date.now() + 75_000).toISOString(),
      }),
      steps: JSON.stringify(steps),
      enabled: true,
      createdBy: sarah.id,
    },
  })

  console.log(`Seeded workflow "${workflow.name}" (${workflow.id})`)
  console.log(`  config: ${workflow.triggerConfig}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
