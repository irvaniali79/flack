'use client'
// Settings → Notifications → Email section: digest email preference (off |
// digest), a live test-send button, and the personal outbox — every email the
// mail adapter has produced for your address, so the feature is verifiable
// end-to-end without a real SMTP server.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Inbox, Loader2, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { api } from '@/lib/api'

interface OutboxEmail {
  id: string
  subject: string
  body: string
  kind: string
  createdAt: string
}

const PREFS = [
  {
    value: 'off' as const,
    title: 'No email',
    copy: 'Notifications stay in the app only.',
  },
  {
    value: 'digest' as const,
    title: 'Digest email',
    copy: 'When quiet hours end, everything you missed goes out as one email.',
  },
]

export function EmailNotifSection() {
  const me = useChatStore((s) => s.me)
  const updateMe = useChatStore((s) => s.updateMe)

  const [emails, setEmails] = useState<OutboxEmail[]>([])
  const [adapter, setAdapter] = useState<string>('outbox')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sendingTest, setSendingTest] = useState(false)
  const [savingPref, setSavingPref] = useState(false)

  const pref = me?.emailNotif ?? 'off'

  const fetchOutbox = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ adapter: string; emails: OutboxEmail[] }>('/api/me/outbox')
      setEmails(data.emails)
      setAdapter(data.adapter)
      setLoaded(true)
    } catch {
      // ignore — section stays collapsed with a retry on next open
    } finally {
      setLoading(false)
    }
  }, [])

  // Load lazily once the section mounts (it is inside the Notifications tab)
  useEffect(() => {
    if (!loaded) void fetchOutbox()
  }, [loaded, fetchOutbox])

  const setPref = async (next: 'off' | 'digest') => {
    if (savingPref || next === pref) return
    setSavingPref(true)
    try {
      await updateMe({ emailNotif: next })
      toast.success(next === 'digest' ? 'Digest emails are on' : 'Email notifications are off')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save preference')
    } finally {
      setSavingPref(false)
    }
  }

  const sendTest = async () => {
    if (sendingTest) return
    setSendingTest(true)
    try {
      await api('/api/me/outbox', {
        method: 'POST',
        body: {
          subject: 'Flack Chat — test email',
          body:
            'This is a test email from Flack Chat.\n\nIf you can read this in your outbox, the mail adapter is doing its job — in production this arrives via SMTP instead.',
        },
      })
      await fetchOutbox()
      toast.success('Test email sent to your outbox')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send test email')
    } finally {
      setSendingTest(false)
    }
  }

  if (!me) return null

  return (
    <div className="space-y-2.5 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-sky-500" aria-hidden />
        <Label>Email notifications</Label>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Flack Chat sends at most one email per quiet-hours period — never per message. The
        digest bundles everything that arrived while your notifications were paused.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PREFS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={pref === option.value}
            disabled={savingPref}
            onClick={() => void setPref(option.value)}
            className={cn(
              'rounded-lg border p-2.5 text-left transition-all duration-150 disabled:opacity-60',
              pref === option.value
                ? 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/30'
                : 'border-border hover:bg-accent',
            )}
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                  pref === option.value ? 'border-sky-500 bg-sky-500' : 'border-muted-foreground/50',
                )}
                aria-hidden
              >
                {pref === option.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              {option.title}
            </p>
            <p className="mt-0.5 pl-5 text-[11px] leading-snug text-muted-foreground">{option.copy}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="text-[11px] text-muted-foreground">
          Goes to <span className="font-medium text-foreground/80">{me.email}</span>
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-lg px-2.5 text-[11px]"
          disabled={sendingTest}
          onClick={() => void sendTest()}
        >
          {sendingTest ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3 w-3" aria-hidden />
          )}
          Send test
        </Button>
      </div>

      {/* ── outbox ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/30">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" aria-hidden />
            Sent emails
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium">
              {emails.length}
            </span>
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            adapter: {adapter}
          </p>
        </div>

        {loading && emails.length === 0 ? (
          <div className="space-y-1.5 px-3 pb-3">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          </div>
        ) : emails.length === 0 ? (
          <p className="px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
            Nothing yet — send yourself a test email, or turn on digests and let quiet hours do it.
          </p>
        ) : (
          <ul className="max-h-44 overflow-y-auto px-2 pb-2">
            {emails.map((email) => (
              <li key={email.id} className="border-t border-border/60 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === email.id ? null : email.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent/50"
                  aria-expanded={openId === email.id}
                >
                  {openId === email.id ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{email.subject}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatDistanceToNow(parseISO(email.createdAt), { addSuffix: true })} ·{' '}
                      {email.kind === 'quiet-digest' ? 'digest' : email.kind}
                    </span>
                  </span>
                </button>
                {openId === email.id && (
                  <pre className="mx-1.5 mb-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-2.5 font-sans text-[11px] leading-relaxed text-muted-foreground">
                    {email.body}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
