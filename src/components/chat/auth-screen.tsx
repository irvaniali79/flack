'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AtSign,
  Bot,
  ChevronRight,
  Hash,
  KeyRound,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'

interface DemoUser {
  email: string
  name: string
  title: string | null
  avatarColor: string
  role: string
  totpEnabled?: boolean
}

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Channels, DMs & threads',
    copy: 'Organized conversations that keep your team in sync — no more inbox zero.',
  },
  {
    icon: Bot,
    title: 'AI agents as teammates',
    copy: 'Aria and CodeReviewer live right in the channel. Mention them like anyone else.',
  },
  {
    icon: Workflow,
    title: 'Automations & workflows',
    copy: 'React with an emoji and let workflows post, cheer and summarize for you.',
  },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AuthScreen() {
  const login = useChatStore((s) => s.login)
  const register = useChatStore((s) => s.register)
  const verify2fa = useChatStore((s) => s.verify2fa)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([])
  // ── two-factor step (set when the password step returns a challenge) ──────
  const [challenge, setChallenge] = useState<{ challengeId: string; email: string } | null>(null)
  const [code, setCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    fetch('/api/auth/demo')
      .then((res) => res.json())
      .then((data: { users?: DemoUser[] }) => setDemoUsers(data.users ?? []))
      .catch(() => setDemoUsers([]))
  }, [])

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const result = await login(email, password)
        if (result && result.requires2fa) {
          // Password accepted — now the authenticator code
          setChallenge({ challengeId: result.challengeId, email: result.email })
          setCode('')
          setRecoveryMode(false)
          setBusy(false)
          return
        }
      } else {
        await register(email, name, password)
      }
      toast.success('Welcome to Acme Chat 👋')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const submit2fa = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!challenge) return
    setError(null)
    setBusy(true)
    try {
      await verify2fa(challenge.challengeId, code.trim())
      toast.success('Welcome to Acme Chat 👋')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work')
      // Wrong code consumed the challenge — restart from the password step
      setChallenge(null)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const demoLogin = async (user: DemoUser) => {
    setError(null)
    setBusy(true)
    try {
      const result = await login(user.email, 'demo1234')
      if (result && result.requires2fa) {
        setChallenge({ challengeId: result.challengeId, email: result.email })
        setCode('')
        setRecoveryMode(false)
        setBusy(false)
        return
      }
      toast.success(`Signed in as ${user.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* ── Left brand panel ─────────────────────────────────────────────── */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-accent-deep px-8 py-10 text-zinc-100 lg:w-[52%] lg:px-14 lg:py-14">
        {/* backdrop: grid + emerald glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, oklch(0.985 0 0) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.985 0 0) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, oklch(0.696 0.17 162.48), transparent)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, oklch(0.7 0.15 80), transparent)' }}
          aria-hidden
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-black text-white shadow-lg shadow-emerald-950/50">
              A
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight">Acme Chat</p>
              <p className="text-xs text-zinc-400">Acme Inc</p>
            </div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mt-10 max-w-md text-4xl font-black leading-tight tracking-tight lg:mt-16 lg:text-5xl"
          >
            Where work
            <br />
            happens<span className="text-emerald-400">.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="mt-4 max-w-md text-base leading-relaxed text-zinc-400"
          >
            Your team&rsquo;s command center — with AI teammates that summarize,
            review code and celebrate your deploys alongside you.
          </motion.p>

          <div className="mt-10 space-y-5 lg:mt-12">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + index * 0.12, ease: 'easeOut' }}
                className="flex items-start gap-3.5"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                  <feature.icon className="h-4.5 w-4.5 text-emerald-400" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{feature.title}</p>
                  <p className="mt-0.5 max-w-sm text-[13px] leading-relaxed text-zinc-500">{feature.copy}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* mini mock message preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
          className="relative mt-10 hidden rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur lg:block"
        >
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2.5">
            <Hash className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            <span className="text-xs font-semibold text-zinc-300">engineering</span>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live
            </span>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-600 text-[9px] font-bold text-white">
                PP
              </span>
              <div>
                <p className="text-[11px] font-semibold text-zinc-200">
                  Priya Patel <span className="ml-1 font-normal text-zinc-500">10:24 AM</span>
                </p>
                <p className="text-[12px] text-zinc-400">
                  deployed v0.9.3 to staging 🚀 reconnect + catch-up is live
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-600 text-[9px] font-bold text-white">
                <Sparkles className="h-3 w-3 text-amber-300" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-zinc-200">
                  Aria
                  <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-300">
                    AI
                  </span>
                  <span className="ml-1 font-normal text-zinc-500">10:24 AM</span>
                </p>
                <p className="text-[12px] text-zinc-400">
                  Congrats on the ship! :tada: Deployment summary thread started.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Right auth panel ─────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-10 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-black text-white">
                A
              </div>
              <p className="font-bold">Acme Chat</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {challenge ? (
              <form onSubmit={submit2fa} className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold leading-tight">Two-factor authentication</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Enter the 6-digit code from your authenticator app for{' '}
                      <span className="font-medium text-foreground">{challenge.email}</span>.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="totp-code">
                    {recoveryMode ? 'Recovery code' : 'Authenticator code'}
                  </Label>
                  <Input
                    id="totp-code"
                    autoFocus
                    inputMode={recoveryMode ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    placeholder={recoveryMode ? 'acme-xxxx-xxxx' : '••••••'}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    minLength={6}
                    maxLength={16}
                    className={cn(
                      'rounded-lg text-center font-mono text-lg tracking-[0.35em]',
                      !recoveryMode && 'sm:text-xl',
                    )}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {recoveryMode
                      ? 'One-time backup code from the list you saved when you set up 2FA.'
                      : 'Codes rotate every 30 seconds — use the one showing now.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode((prev) => !prev)
                    setCode('')
                    setError(null)
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  {recoveryMode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
                </button>

                {error && (
                  <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={busy || code.trim().length < 6}
                  className="w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                  Verify and sign in
                </Button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setChallenge(null)
                    setCode('')
                    setError(null)
                  }}
                  className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  ← Back to sign in
                </button>
              </form>
            ) : (
              <>
                <div className="mb-6 flex rounded-lg bg-muted p-1" role="tablist">
                  {(['login', 'register'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={mode === tab}
                      onClick={() => {
                        setMode(tab)
                        setError(null)
                      }}
                      className={cn(
                        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                        mode === tab
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab === 'login' ? 'Sign in' : 'Create account'}
                    </button>
                  ))}
                </div>

                <form onSubmit={submit} className="space-y-4">
                  {mode === 'register' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        autoComplete="name"
                        placeholder="Ada Lovelace"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        minLength={2}
                        className="rounded-lg"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@acme.test"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'login' ? '••••••••' : '8+ characters'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={mode === 'login' ? 1 : 8}
                      className="rounded-lg"
                    />
                  </div>

                  {error && (
                    <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </Button>
                </form>
              </>
            )}
          </div>

          {/* demo users */}
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Or hop in as a demo teammate
              </p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {demoUsers.length === 0
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[60px] animate-pulse rounded-xl bg-muted" />
                  ))
                : demoUsers.map((user) => (
                    <button
                      key={user.email}
                      type="button"
                      disabled={busy}
                      onClick={() => void demoLogin(user)}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-all duration-150 hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:opacity-60"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: user.avatarColor }}
                        aria-hidden
                      >
                        {initials(user.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="block truncate text-sm font-medium leading-tight">{user.name}</span>
                          {user.totpEnabled && (
                            <ShieldCheck
                              className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                              aria-label="Two-factor authentication is on — a code will be asked at sign-in"
                            />
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.title ?? user.role}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        aria-hidden
                      />
                    </button>
                  ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Demo accounts use the password <code className="rounded bg-muted px-1 py-px font-mono">demo1234</code>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
