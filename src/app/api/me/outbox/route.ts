// Personal email outbox — what the mail adapter has "sent" to my address.
//   GET  /api/me/outbox            → last 20 rows for my email
//   POST /api/me/outbox { subject, body } → send myself a test email
import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { getMailAdapterName, sendMail } from '@/lib/mail'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    const rows = await db.emailOutbox.findMany({
      where: { toEmail: me.email },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, subject: true, body: true, kind: true, createdAt: true },
    })
    return { adapter: getMailAdapterName(), emails: rows }
  })
}

const testSchema = z.object({
  subject: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(2000).optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = testSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) throw new HttpError(400, 'Subject and body required')

    await sendMail({
      orgId: me.orgId,
      to: me.email,
      subject: parsed.data.subject ?? 'Acme Chat — test email',
      body:
        parsed.data.body ??
        'This is a test email from Acme Chat.\n\nIf you can read this in your outbox, the mail adapter is doing its job — in production this arrives via SMTP instead.',
      kind: 'test',
    })
    return { ok: true }
  })
}

export const dynamic = 'force-dynamic'
