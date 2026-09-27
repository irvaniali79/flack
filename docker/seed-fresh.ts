// Fresh-workspace seeder — runs on first boot when FLACK_SEED_DEMO=0
// (invoked by docker/entrypoint.sh).
//
// Without an org the register endpoint answers "No workspace found", so a
// blank-database boot would be a dead end. This creates the minimum viable
// workspace: one org, the default public channels, and one owner account.
//
// Standalone-safe: imports only @prisma/client + node:crypto (no @/ path
// aliases — runs outside the Next build, directly with bun).
// The password format mirrors src/lib/auth.ts exactly:
//   `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

async function main(): Promise<void> {
  const email = (process.env.FLACK_ADMIN_EMAIL ?? 'admin@flack.local').toLowerCase().trim()
  const name = process.env.FLACK_ADMIN_NAME ?? 'Flack Admin'
  const password = process.env.FLACK_ADMIN_PASSWORD ?? 'flack-admin'

  if (password.length < 8) {
    throw new Error('FLACK_ADMIN_PASSWORD must be at least 8 characters')
  }

  const org = await db.org.create({
    data: { name: 'Flack', slug: 'flack', plan: 'free' },
  })

  const owner = await db.user.create({
    data: {
      orgId: org.id,
      email,
      name,
      passwordHash: hashPassword(password),
      role: 'owner',
      title: 'Workspace owner',
    },
  })

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  const channels = [
    { name: 'general', topic: 'Company-wide announcements and work-based matters' },
    { name: 'random', topic: 'Non-work banter and water-cooler conversation' },
  ]

  for (const channel of channels) {
    const created = await db.channel.create({
      data: {
        orgId: org.id,
        name: channel.name,
        slug: slugify(channel.name),
        topic: channel.topic,
        kind: 'public',
        isDefault: true,
        createdBy: owner.id,
      },
    })
    await db.channelMember.create({
      data: { channelId: created.id, userId: owner.id, role: 'owner' },
    })
  }

  console.log('[flack-entrypoint] fresh workspace ready — org "Flack", channels #general + #random')
  console.log(
    `[flack-entrypoint] owner login: ${email} (${
      process.env.FLACK_ADMIN_PASSWORD ? 'password from FLACK_ADMIN_PASSWORD' : 'default password "flack-admin" — change it after first login'
    })`,
  )
}

main()
  .catch((err: unknown) => {
    console.error('[flack-entrypoint] fresh workspace seed failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void db.$disconnect()
  })
