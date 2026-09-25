// Mail adapter — the platform's pluggable outbound-email boundary
// (same adapter pattern as storage/cache/llm in the architecture plan).
//
// The bundled implementation is a LOCAL OUTBOX: every send is persisted to the
// EmailOutbox table so the product can show users exactly what would hit their
// inbox (Settings → Notifications → Sent emails). A production SMTP adapter
// implements the same interface and swaps in via config; the outbox row is
// still written first so delivery always has an audit trail.
import { db } from '@/lib/db'

export interface SendMailInput {
  orgId: string
  to: string
  subject: string
  body: string
  /** Category for filtering, e.g. "quiet-digest" | "test" */
  kind: string
}

export interface MailAdapter {
  readonly name: string
  send(input: SendMailInput): Promise<void>
}

const outboxAdapter: MailAdapter = {
  name: 'outbox',
  async send(input) {
    await db.emailOutbox.create({
      data: {
        orgId: input.orgId,
        toEmail: input.to,
        subject: input.subject.slice(0, 300),
        body: input.body.slice(0, 20000),
        kind: input.kind.slice(0, 40),
      },
    })
  },
}

let adapter: MailAdapter = outboxAdapter

/** Swap the mail backend (tests / future SMTP config). */
export function setMailAdapter(next: MailAdapter) {
  adapter = next
}

export function getMailAdapterName(): string {
  return adapter.name
}

export async function sendMail(input: SendMailInput): Promise<void> {
  await adapter.send(input)
}
