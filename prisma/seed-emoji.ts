// Seed custom emoji for the demo workspace — hand-crafted SVGs written to
// uploads/emoji/ + CustomEmoji rows. Idempotent: skips names that exist.
// Run: bun prisma/seed-emoji.ts
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'emoji')

// ─── The SVG art ─────────────────────────────────────────────────────────────

const SVG_FLACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="14" fill="#059669"/>
  <path d="M22 13 H46 V20.5 H29.5 V28 H43 V35.5 H29.5 V51 H22 Z" fill="#fff"/>
</svg>`

const SVG_SHIP_IT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M32 6 C41 14 45 24 45 34 L45 40 L19 40 L19 34 C19 24 23 14 32 6 Z" fill="#f59e0b"/>
  <circle cx="32" cy="26" r="6" fill="#0ea5e9" stroke="#fff" stroke-width="2.5"/>
  <path d="M19 36 L11 46 L19 44 Z" fill="#f97316"/>
  <path d="M45 36 L53 46 L45 44 Z" fill="#f97316"/>
  <path d="M26 42 L26 52 L23 56 M32 42 L32 58 M38 42 L38 52 L41 56" stroke="#f43f5e" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M26 58 L23 52 M38 58 L41 52" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
</svg>`

const SVG_PARTY_PARROT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>
    .p1 { animation: tilt 0.55s infinite alternate ease-in-out; transform-origin: 32px 44px; }
    .p2 { animation: tilt 0.55s infinite alternate ease-in-out -0.275s; transform-origin: 32px 60px; }
    @keyframes tilt { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
  </style>
  <g class="p1">
    <path d="M14 24 C14 12 26 8 38 12 C48 15 52 24 50 32 L46 44 L22 44 Z" fill="#f43f5e"/>
    <circle cx="40" cy="24" r="7" fill="#fff"/>
    <circle cx="41.5" cy="24" r="3.4" fill="#0f172a"/>
    <path d="M50 22 L58 24 L50 28 Z" fill="#f59e0b"/>
    <path d="M28 34 L36 37 L28 40 Z" fill="#f59e0b"/>
  </g>
  <g class="p2">
    <rect x="20" y="42" width="24" height="7" rx="3.5" fill="#fbbf24"/>
  </g>
  <path d="M20 46 C18 52 24 58 22 62" stroke="#10b981" stroke-width="5" stroke-linecap="round" fill="none"/>
</svg>`

const SVG_LLGAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="6" width="52" height="52" rx="12" fill="#1e293b"/>
  <path d="M20 40 C20 30 28 24 34 26 C40 28 44 34 42 40" fill="#fbbf24"/>
  <circle cx="30" cy="34" r="2.4" fill="#1e293b"/>
  <path d="M22 44 C24 48 34 50 42 46" stroke="#f43f5e" stroke-width="4" stroke-linecap="round" fill="none"/>
  <text x="32" y="58" font-family="monospace" font-size="9" font-weight="bold" fill="#34d399" text-anchor="middle">llama</text>
</svg>`

const SEEDS: Array<{ name: string; svg: string }> = [
  { name: 'flack', svg: SVG_FLACK },
  { name: 'ship_it', svg: SVG_SHIP_IT },
  { name: 'party_parrot', svg: SVG_PARTY_PARROT },
  { name: 'lgtm_llama', svg: SVG_LLGAM },
]

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  const org = await db.org.findFirst({ select: { id: true, name: true } })
  if (!org) {
    console.error('No org found — run prisma/seed.ts first')
    process.exit(1)
  }
  const sarah = await db.user.findFirst({ where: { email: 'sarah@flack.test' }, select: { id: true } })

  await mkdir(UPLOAD_DIR, { recursive: true })

  let created = 0
  for (const seed of SEEDS) {
    const existing = await db.customEmoji.findFirst({ where: { orgId: org.id, name: seed.name } })
    if (existing) {
      console.log(`  :${seed.name}: already exists — skip`)
      continue
    }
    const filename = `${randomUUID()}.svg`
    const filePath = path.join(UPLOAD_DIR, filename)
    await writeFile(filePath, seed.svg, 'utf-8')
    await db.customEmoji.create({
      data: {
        orgId: org.id,
        name: seed.name,
        path: filePath,
        mimeType: 'image/svg+xml',
        size: Buffer.byteLength(seed.svg, 'utf-8'),
        createdBy: sarah?.id ?? null,
      },
    })
    await db.auditLog.create({
      data: {
        orgId: org.id,
        actorId: sarah?.id ?? null,
        action: 'emoji.created',
        target: `:${seed.name}:`,
        meta: JSON.stringify({ seeded: true }),
      },
    })
    console.log(`  :${seed.name}: seeded`)
    created++
  }

  console.log(`Done — ${created} created, ${SEEDS.length - created} skipped`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
