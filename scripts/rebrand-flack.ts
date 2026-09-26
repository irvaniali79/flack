// One-off rebrand migration: Acme → Flack across every TEXT column of every
// table in the SQLite DB (org name/slug, user emails, message bodies, agent
// instructions, workflow configs, notification/audit text, emoji shortcodes…).
// Case variants: ACME→FLACK, Acme→Flack, acme→flack (REPLACE is case-sensitive,
// three nested passes; SQLite LIKE is case-insensitive so one LIKE catches all).
// Run: bun scripts/rebrand-flack.ts
import { statSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const tables = (await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations'`
  )).map((t) => t.name)

  let totalRows = 0
  for (const table of tables) {
    const cols = await db.$queryRawUnsafe<{ name: string; type: string }[]>(
      `PRAGMA table_info("${table}")`
    )
    for (const col of cols) {
      if (!/text|char|clob/i.test(col.type ?? '')) continue
      const updated = await db.$executeRawUnsafe(
        `UPDATE "${table}" SET "${col.name}" = ` +
          `REPLACE(REPLACE(REPLACE("${col.name}", 'ACME', 'FLACK'), 'Acme', 'Flack'), 'acme', 'flack') ` +
          `WHERE "${col.name}" LIKE '%acme%'`
      )
      if (updated > 0) {
        console.log(`  ${table}.${col.name}: ${updated} row(s)`)
        totalRows += updated
      }
    }
  }

  // The :flack: emoji glyph was redrawn (A → F) on disk — re-sync its stored size.
  const emoji = await db.customEmoji.findFirst({ where: { name: 'flack' } })
  if (emoji) {
    await db.customEmoji.update({
      where: { id: emoji.id },
      data: { size: statSync(emoji.path).size },
    })
    console.log(`  CustomEmoji ':flack:' size re-synced (${statSync(emoji.path).size} bytes)`)
  }

  // Sanity report
  const org = await db.org.findFirst()
  const sarah = await db.user.findFirst({ where: { email: { contains: 'sarah' } } })
  console.log(`\nRebrand complete — ${totalRows} row update(s) across ${tables.length} tables.`)
  console.log(`  Org: ${org?.name} (slug: ${org?.slug})`)
  console.log(`  Sarah's login is now: ${sarah?.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
