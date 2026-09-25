// Step 2 of login for 2FA-armed accounts: the browser sends the challenge id
// from the password step plus a 6-digit TOTP code (or a recovery code).
// Only a valid code mints the session.
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, handle, HttpError } from '@/lib/auth'
import { consumeLoginChallenge } from '@/lib/login-challenge'
import { consumeRecoveryCode, verifyTotp } from '@/lib/totp'
import { serializeUser } from '@/lib/serialize'
import { writeAudit } from '@/lib/audit'

const schema = z.object({
  challengeId: z.string().min(10).max(128),
  code: z.string().trim().min(6).max(24),
})

export async function POST(request: Request) {
  return handle(async () => {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'A 6-digit code (or recovery code) is required')

    const userId = consumeLoginChallenge(parsed.data.challengeId)
    if (!userId) throw new HttpError(401, 'This sign-in challenge expired — start again')

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { agent: { select: { handle: true } } },
    })
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      throw new HttpError(401, 'This account no longer requires two-factor authentication')
    }

    const code = parsed.data.code

    if (verifyTotp(user.totpSecret, code)) {
      await createSession(user.id, request)
      return { user: serializeUser(user) }
    }

    // Not a valid TOTP code — try a one-time recovery code (consumes it)
    if (user.recoveryCodes) {
      const remaining = consumeRecoveryCode(code, user.recoveryCodes)
      if (remaining !== null) {
        await db.user.update({ where: { id: user.id }, data: { recoveryCodes: remaining } })
        await createSession(user.id, request)
        void writeAudit({
          orgId: user.orgId,
          actorId: user.id,
          action: 'auth.recovery_code_used',
          target: user.email,
          meta: { remaining: JSON.parse(remaining).length },
        }).catch(() => {})
        return { user: serializeUser(user), viaRecoveryCode: true }
      }
    }

    // Wrong code — the challenge was consumed, so the browser restarts the flow
    throw new HttpError(401, 'That code is not valid. Codes rotate every 30 seconds — try the current one')
  })
}

export const dynamic = 'force-dynamic'
