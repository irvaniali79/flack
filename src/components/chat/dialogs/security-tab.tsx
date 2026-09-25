'use client'
// Settings → Security tab: TOTP two-factor enrollment (QR + secret + first-code
// verify), one-time recovery codes (shown once, copy/download), regenerate
// (password), disable (live code or password), and the active-sessions device
// list with per-session + bulk revoke. Talks to /api/me/2fa and /api/me/sessions.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Monitor,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { api } from '@/lib/api'

interface SetupResponse {
  secret: string
  otpauthUri: string
  qrSvg: string
}

interface EnableResponse {
  enabled: boolean
  recoveryCodes: string[]
}

interface SessionRow {
  id: string
  current: boolean
  device: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
}

/** Active sessions — every signed-in device for this account, revoke per row. */
function SessionsSection() {
  const logout = useChatStore((s) => s.logout)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ sessions: SessionRow[] }>('/api/me/sessions')
      setSessions(data.sessions)
    } catch {
      setSessions([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (row: SessionRow) => {
    if (busy) return
    setBusy(row.id)
    try {
      const res = await api<{ revoked: number; wasCurrent: boolean }>(`/api/me/sessions/${row.id}`, {
        method: 'DELETE',
      })
      if (res.wasCurrent) {
        toast.success('Signed out — see you soon 👋')
        await logout()
        return
      }
      toast.success(`Signed out ${row.device}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the session')
    } finally {
      setBusy(null)
    }
  }

  const revokeOthers = async () => {
    if (busy || !sessions?.some((s) => !s.current)) return
    setBusy('others')
    try {
      const res = await api<{ revoked: number }>('/api/me/sessions?action=revoke-others', {
        method: 'POST',
        body: {},
      })
      toast.success(`Signed out ${res.revoked} other session${res.revoked === 1 ? '' : 's'}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke sessions')
    } finally {
      setBusy(null)
    }
  }

  const others = sessions?.filter((s) => !s.current) ?? []

  return (
    <div className="space-y-2.5 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Label>Active sessions</Label>
        <span className="ml-auto rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">
          {sessions ? `${sessions.length} signed in` : '…'}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Every device where this account is signed in. Revoking a session signs it out
        immediately — its cookie stops working.
      </p>

      {sessions === null ? (
        <div className="space-y-1.5">
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active sessions.</p>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((row) => {
            const isPhone = /iPhone|iPad|Android/.test(row.device)
            const isApi = row.device.includes('API client')
            return (
              <li
                key={row.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border p-2.5',
                  row.current ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    row.current
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {isApi ? <ShieldCheck className="h-4 w-4" /> : isPhone ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                    {row.device}
                    {row.current && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Active {formatDistanceToNow(parseISO(row.lastUsedAt), { addSuffix: true })} · signed in{' '}
                    {formatDistanceToNow(parseISO(row.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void revoke(row)}
                  className="h-7 shrink-0 rounded-lg px-2 text-[11px]"
                  aria-label={`Sign out ${row.device}`}
                >
                  {busy === row.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <LogOut className="h-3 w-3" aria-hidden />
                  )}
                  {row.current ? 'Sign out' : 'Revoke'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {others.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void revokeOthers()}
          className="w-full rounded-lg text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
        >
          {busy === 'others' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <LogOut className="h-3.5 w-3.5" aria-hidden />
          )}
          Sign out {others.length} other session{others.length === 1 ? '' : 's'}
        </Button>
      )}
    </div>
  )
}

type Phase = 'status' | 'setup' | 'recovery' | 'disable' | 'regenerate'

export function SecurityTab() {
  const me = useChatStore((s) => s.me)
  const refreshMe = useChatStore((s) => s.refreshMe)
  const [phase, setPhase] = useState<Phase>('status')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // setup flow
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [code, setCode] = useState('')

  // one-time recovery codes
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState(false)

  // disable / regenerate
  const [secretInput, setSecretInput] = useState('')
  const [password, setPassword] = useState('')

  if (!me) return null
  const enabled = Boolean(me.totpEnabled)

  // ── actions ─────────────────────────────────────────────────────────────────

  const startSetup = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await api<SetupResponse>('/api/me/2fa?action=setup', { method: 'POST', body: {} })
      setSetup(data)
      setCode('')
      setPhase('setup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start setup')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnable = async () => {
    if (!setup || !/^\d{6}$/.test(code.trim())) return
    setBusy(true)
    setError(null)
    try {
      const data = await api<EnableResponse>('/api/me/2fa?action=enable', {
        method: 'POST',
        body: { code: code.trim() },
      })
      setRecoveryCodes(data.recoveryCodes)
      setRevealed(false)
      setPhase('recovery')
      await refreshMe()
      toast.success('Two-factor authentication is on 🛡️')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not verify')
    } finally {
      setBusy(false)
    }
  }

  const finishRecovery = () => {
    setRecoveryCodes(null)
    setSetup(null)
    setCode('')
    setPhase('status')
  }

  const doDisable = async () => {
    setBusy(true)
    setError(null)
    try {
      await api('/api/me/2fa?action=disable', {
        method: 'POST',
        body: {
          ...(secretInput.trim() ? { code: secretInput.trim() } : {}),
          ...(password ? { password } : {}),
        },
      })
      await refreshMe()
      setPhase('status')
      setSecretInput('')
      setPassword('')
      toast.success('Two-factor authentication is off')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable 2FA')
    } finally {
      setBusy(false)
    }
  }

  const doRegenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ recoveryCodes: string[] }>('/api/me/2fa?action=recovery', {
        method: 'POST',
        body: { password },
      })
      setRecoveryCodes(data.recoveryCodes)
      setRevealed(false)
      setPhase('recovery')
      setPassword('')
      toast.success('New recovery codes generated — previous list is void')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate codes')
    } finally {
      setBusy(false)
    }
  }

  const downloadRecoveryCodes = () => {
    if (!recoveryCodes) return
    const text =
      'Acme Chat — recovery codes\n' +
      'Each code works exactly once. Store them somewhere safe.\n\n' +
      recoveryCodes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`).join('\n') +
      '\n'
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'acme-chat-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  // ── phases ─────────────────────────────────────────────────────────────────

  if (phase === 'setup' && setup) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Smartphone className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Set up your authenticator</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Scan the QR code with Google Authenticator, 1Password, Authy or any TOTP app — then
              confirm the 6-digit code it shows.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <div
            className="h-44 w-44 overflow-hidden rounded-lg bg-white p-2 shadow-inner"
            // Server-generated QR SVG (trusted content, our own qrcode lib)
            dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            role="img"
            aria-label="QR code to scan with your authenticator app"
          />
          <div className="w-full space-y-1.5 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Can&apos;t scan? Enter this secret manually
            </p>
            <code className="block break-all rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground">
              {setup.secret}
            </code>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="totp-verify">Enter the 6-digit code</Label>
          <Input
            id="totp-verify"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="rounded-lg text-center font-mono text-lg tracking-[0.35em]"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPhase('status')
              setSetup(null)
              setCode('')
              setError(null)
            }}
            className="flex-1 rounded-lg"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || code.length !== 6}
            onClick={() => void confirmEnable()}
            className="flex-1 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Turn on 2FA
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'recovery' && recoveryCodes) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
          <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Save these recovery codes now</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              This is the only time they are shown. Each code signs you in once if you lose your
              authenticator — store them somewhere safe (not in this chat 😉).
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {recoveryCodes.length} one-time codes
            </p>
            <button
              type="button"
              onClick={() => setRevealed((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {recoveryCodes.map((recoveryCode) => (
              <li
                key={recoveryCode}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-xs"
              >
                <span
                  className={cn(!revealed && 'select-none blur-[5px]')}
                  aria-label={revealed ? recoveryCode : 'hidden recovery code'}
                >
                  {revealed ? recoveryCode : 'acme-xxxx-xxxx'}
                </span>
                {revealed && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCode)
                      toast.success('Code copied')
                    }}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Copy recovery code ${recoveryCode}`}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-lg"
              onClick={() => {
                void navigator.clipboard.writeText(recoveryCodes.join('\n'))
                toast.success('All codes copied')
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy all
            </Button>
            <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={downloadRecoveryCodes}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Download .txt
            </Button>
          </div>
        </div>

        <Button
          onClick={finishRecovery}
          className="w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
        >
          <Check className="h-4 w-4" aria-hidden /> I saved my codes
        </Button>
      </div>
    )
  }

  if (phase === 'disable') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3.5">
          <ShieldOff className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Turn off two-factor authentication?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Your account will only need its password at sign-in. Confirm with a current
              authenticator code (or a recovery code), or your password.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="disable-code">Authenticator or recovery code</Label>
          <Input
            id="disable-code"
            placeholder="123456 or acme-xxxx-xxxx"
            value={secretInput}
            onChange={(event) => setSecretInput(event.target.value.trim())}
            className="rounded-lg font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="disable-password">…or account password</Label>
          <Input
            id="disable-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPhase('status')
              setSecretInput('')
              setPassword('')
              setError(null)
            }}
            className="flex-1 rounded-lg"
          >
            Keep 2FA
          </Button>
          <Button
            variant="destructive"
            disabled={busy || (!secretInput && !password)}
            onClick={() => void doDisable()}
            className="flex-1 rounded-lg"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
            Turn off
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'regenerate') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <RefreshCcw className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Regenerate recovery codes</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              This voids your current list and mints a fresh set of 8 one-time codes.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regen-password">Account password</Label>
          <Input
            id="regen-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPhase('status')
              setPassword('')
              setError(null)
            }}
            className="flex-1 rounded-lg"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || !password}
            onClick={() => void doRegenerate()}
            className="flex-1 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCcw className="h-4 w-4" aria-hidden />}
            Regenerate
          </Button>
        </div>
      </div>
    )
  }

  // ── status (default) ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border p-4">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            enabled
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Two-factor authentication</p>
            <span
              className={cn(
                'rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide',
                enabled
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {enabled ? 'on' : 'off'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {enabled
              ? 'Sign-in needs your password plus a rotating 6-digit code from your authenticator app. Recovery codes cover a lost device.'
              : 'Add a second factor at sign-in: a rotating 6-digit code from any TOTP authenticator app (Google Authenticator, 1Password, Authy…).'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={busy}
                  onClick={() => {
                    setPhase('regenerate')
                    setError(null)
                  }}
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Recovery codes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
                  disabled={busy}
                  onClick={() => {
                    setPhase('disable')
                    setError(null)
                  }}
                >
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Turn off
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void startSetup()}
                className="rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                )}
                Set up 2FA
              </Button>
            )}
          </div>
        </div>
      </div>

      <SessionsSection />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="rounded-xl bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">How it works</p>
        <p className="mt-1">
          Acme Chat implements the TOTP standard (RFC 6238) — the same one your bank uses. The
          secret never leaves your account un-encrypted, codes are only valid for 30 seconds, and
          8 one-time recovery codes keep you from being locked out.
        </p>
      </div>
    </div>
  )
}
