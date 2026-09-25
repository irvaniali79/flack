// Two-factor account management for the signed-in user:
//   POST /api/me/2fa/setup    → generate + store a pending TOTP secret, return
//                               the otpauth URI and a QR SVG to scan
//   POST /api/me/2fa/enable   → verify the first code, arm 2FA, mint recovery codes
//   POST /api/me/2fa/disable  → verify a live code (or password) and turn it off
//   POST /api/me/2fa/recovery → regenerate recovery codes (password required)
//   GET  /api/me/2fa          → { enabled, hasRecoveryCodes }
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser, verifyPassword } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchRecoveryCode,
  otpauthUri,
  verifyTotp,
} from '@/lib/totp'

export async function GET() {
  return handle(async () => {
    const me = await requireUser()
    return {
      enabled: me.totpEnabled,
      hasRecoveryCodes: Boolean(me.recoveryCodes && JSON.parse(me.recoveryCodes).length > 0),
    }
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const url = new URL(request.url)
    const action = url.searchParams.get('action') ?? ''

    // ── setup: mint a pending secret + QR ────────────────────────────────────
    if (action === 'setup') {
      if (me.kind !== 'human') throw new HttpError(400, 'Agent accounts cannot use two-factor authentication')
      const secret = generateTotpSecret()
      await db.user.update({ where: { id: me.id }, data: { totpSecret: secret, totpEnabled: false } })
      const uri = otpauthUri(me.email, secret)
      const qrSvg = await QRCode.toString(uri, {
        type: 'svg',
        margin: 1,
        width: 240,
        color: { dark: '#09090b', light: '#ffffff' },
      })
      return { secret, otpauthUri: uri, qrSvg }
    }

    // ── enable: verify the first code from the authenticator ─────────────────
    if (action === 'enable') {
      const parsed = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })
        .safeParse(await request.json().catch(() => ({})))
      if (!parsed.success) throw new HttpError(400, 'Enter the 6-digit code from your authenticator')
      if (!me.totpSecret) throw new HttpError(400, 'Start setup first — no pending secret')
      if (me.totpEnabled) throw new HttpError(400, 'Two-factor authentication is already on')
      if (!verifyTotp(me.totpSecret, parsed.data.code)) {
        throw new HttpError(400, 'That code is not valid — codes rotate every 30 seconds, try the current one')
      }

      const recovery = generateRecoveryCodes()
      await db.user.update({
        where: { id: me.id },
        data: {
          totpEnabled: true,
          recoveryCodes: JSON.stringify(recovery.map(hashRecoveryCode)),
        },
      })
      void writeAudit({
        orgId: me.orgId,
        actorId: me.id,
        action: 'auth.2fa_enabled',
        target: me.email,
      }).catch(() => {})
      // Plain-text recovery codes are returned exactly ONCE
      return { enabled: true, recoveryCodes: recovery }
    }

    // ── disable: a live TOTP code or the account password ────────────────────
    if (action === 'disable') {
      const parsed = z.object({ code: z.string().trim().min(6).max(24).optional(), password: z.string().min(1).max(200).optional() })
        .safeParse(await request.json().catch(() => ({})))
      if (!parsed.success) throw new HttpError(400, 'Provide your current code or password')
      if (!me.totpEnabled) throw new HttpError(400, 'Two-factor authentication is not on')

      const { code, password } = parsed.data
      let authorized = false
      if (code && me.totpSecret) {
        authorized = verifyTotp(me.totpSecret, code)
        if (!authorized && me.recoveryCodes) authorized = matchRecoveryCode(code, me.recoveryCodes)
      }
      if (!authorized && password) authorized = verifyPassword(password, me.passwordHash)
      if (!authorized) throw new HttpError(401, 'That code or password is not correct')

      await db.user.update({
        where: { id: me.id },
        data: { totpEnabled: false, totpSecret: null, recoveryCodes: null },
      })
      void writeAudit({
        orgId: me.orgId,
        actorId: me.id,
        action: 'auth.2fa_disabled',
        target: me.email,
      }).catch(() => {})
      return { enabled: false }
    }

    // ── recovery: regenerate one-time codes (password required) ───────────────
    if (action === 'recovery') {
      const parsed = z.object({ password: z.string().min(1).max(200) })
        .safeParse(await request.json().catch(() => ({})))
      if (!parsed.success) throw new HttpError(400, 'Password required to regenerate recovery codes')
      if (!me.totpEnabled) throw new HttpError(400, 'Enable two-factor authentication first')
      if (!verifyPassword(parsed.data.password, me.passwordHash)) {
        throw new HttpError(401, 'That password is not correct')
      }
      const recovery = generateRecoveryCodes()
      await db.user.update({
        where: { id: me.id },
        data: { recoveryCodes: JSON.stringify(recovery.map(hashRecoveryCode)) },
      })
      return { recoveryCodes: recovery }
    }

    throw new HttpError(404, 'Unknown action — use setup | enable | disable | recovery')
  })
}

export const dynamic = 'force-dynamic'
