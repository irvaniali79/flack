// One-off: seed demo messages that use custom emoji shortcodes.
// Run: bun prisma/seed-emoji-messages.ts
export {}

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()

async function main() {
  const org = await db.org.findFirst({ select: { id: true } })
  if (!org) process.exit(1)

  const engineering = await db.channel.findFirst({
    where: { orgId: org.id, slug: 'engineering' },
    select: { id: true, name: true },
  })
  const random = await db.channel.findFirst({
    where: { orgId: org.id, slug: 'random' },
    select: { id: true, name: true },
  })
  const priya = await db.user.findFirst({ where: { email: 'priya@acme.test' }, select: { id: true } })
  const marcus = await db.user.findFirst({ where: { email: 'marcus@acme.test' }, select: { id: true } })

  const already = await db.message.findFirst({
    where: { body: { contains: ':party_parrot:' } },
    select: { id: true },
  })
  if (already) {
    console.log('custom-emoji demo message already exists — skip')
    return
  }

  if (engineering && priya) {
    await db.message.create({
      data: {
        channelId: engineering.id,
        senderId: priya.id,
        body: 'Custom emoji are live in this workspace! Try :ship_it: :party_parrot: :acme: :lgtm_llama: — upload more in Admin → Emoji 🎨',
        mentions: JSON.stringify({ userIds: [], specials: [] }),
      },
    })
    console.log(`  seeded message in #${engineering.name}`)
  }

  if (random && marcus) {
    const root = await db.message.create({
      data: {
        channelId: random.id,
        senderId: marcus.id,
        body: ':party_parrot: :party_parrot: :party_parrot: Friday deploy energy',
        mentions: JSON.stringify({ userIds: [], specials: [] }),
      },
    })
    const emma = await db.user.findFirst({ where: { email: 'emma@acme.test' }, select: { id: true } })
    if (emma) {
      await db.reaction.create({ data: { messageId: root.id, userId: emma.id, emoji: ':party_parrot:' } })
    }
    const tom = await db.user.findFirst({ where: { email: 'tom@acme.test' }, select: { id: true } })
    if (tom) {
      await db.reaction.create({ data: { messageId: root.id, userId: tom.id, emoji: ':ship_it:' } })
    }
    console.log(`  seeded parrot message + custom-emoji reactions in #${random.name}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
