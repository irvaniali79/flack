'use client'
// The "Add to Slack"-style connect flow — 3 steps in one dialog:
//   1. Account   — which account label to link (sample suggestions)
//   2. Permissions — the OAuth-style consent list of scopes
//   3. Post to   — destination channel + event subscriptions
// Admin-only at the API level; members never see this dialog.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Hash,
  Loader2,
  Lock,
  Radio,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { cn } from '@/lib/utils'
import type { ConnectorConnectionDTO, ConnectorDefDTO } from '@/lib/types'
import { ConnectorTile } from './connector-icon'

const STEPS = [
  { n: 1, label: 'Account' },
  { n: 2, label: 'Permissions' },
  { n: 3, label: 'Post to' },
] as const

export function ConnectDialog({
  def,
  open,
  onOpenChange,
  onConnected,
}: {
  def: ConnectorDefDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}) {
  const channels = useChatStore((s) => s.channels)
  const openChannel = useChatStore((s) => s.openChannel)
  const setView = useViewStore((s) => s.setView)

  const [step, setStep] = useState(1)
  const [account, setAccount] = useState('')
  const [channelId, setChannelId] = useState('')
  const [subs, setSubs] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  // Connectors can post to channels only — never DMs
  const postable = channels.filter((c) => c.kind === 'public' || c.kind === 'private')

  // Reset the form whenever the dialog opens for a connector
  useEffect(() => {
    if (!open || !def) return
    setStep(1)
    setAccount(def.sampleAccounts[0] ?? '')
    const general = postable.find((c) => c.slug === 'general') ?? postable[0]
    setChannelId(general?.id ?? '')
    setSubs(Object.fromEntries(def.events.map((e) => [e.id, e.defaultOn])))
  }, [open, def])

  if (!def) return null

  const accountOk = account.trim().length >= 3
  const enabledEvents = def.events.filter((e) => subs[e.id])
  const channel = postable.find((c) => c.id === channelId)

  const goToChannel = (id: string) => {
    setView('chat')
    void openChannel(id)
  }

  const connect = async () => {
    if (busy || !channelId || !accountOk) return
    setBusy(true)
    try {
      const data = await api<{ connection: ConnectorConnectionDTO; message: string }>(
        `/api/connectors/${def.id}/connect`,
        {
          method: 'POST',
          body: {
            channelId,
            accountLabel: account.trim(),
            eventIds: enabledEvents.map((e) => e.id),
          },
        },
      )
      toast.success(`Connected to #${data.connection.channel.name}`, {
        action: {
          label: 'View in channel',
          onClick: () => goToChannel(data.connection.channel.id),
        },
      })
      onOpenChange(false)
      onConnected()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not connect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ConnectorTile icon={def.icon} color={def.color} size="lg" />
            <div className="min-w-0">
              <DialogTitle className="leading-tight">Add {def.name}</DialogTitle>
              <DialogDescription className="mt-0.5 line-clamp-1">
                {def.tagline}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* step indicator */}
        <ol className="flex items-center gap-1.5" aria-label="Connect flow steps">
          {STEPS.map((s, i) => {
            const state = s.n === step ? 'current' : s.n < step ? 'done' : 'todo'
            return (
              <li key={s.n} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                    state === 'current' && 'bg-emerald-600 text-white',
                    state === 'done' && 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400',
                    state === 'todo' && 'bg-muted text-muted-foreground',
                  )}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {state === 'done' ? <Check className="h-3 w-3" aria-hidden /> : s.n}
                </span>
                <span
                  className={cn(
                    'truncate text-[11px] font-medium',
                    state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="h-px min-w-2 flex-1 bg-border" aria-hidden />
                )}
              </li>
            )
          })}
        </ol>

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="connector-account" className="text-xs">
                Account
              </Label>
              <Input
                id="connector-account"
                autoFocus
                placeholder="e.g. you@company.com"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="rounded-lg"
              />
              {account.trim().length > 0 && account.trim().length < 3 && (
                <p className="text-[11px] text-destructive">At least 3 characters, please.</p>
              )}
            </div>
            {def.sampleAccounts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Suggested accounts</p>
                <div className="flex flex-wrap gap-1.5">
                  {def.sampleAccounts.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setAccount(sample)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-150',
                        account === sample
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-muted/40 text-muted-foreground hover:border-emerald-500/40 hover:text-foreground',
                      )}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              This demo skips the real OAuth round-trip — the label you pick is the account
              {def.name} will post as.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
              <ConnectorTile icon={def.icon} color={def.color} size="sm" />
              <p className="text-xs leading-snug">
                <strong>{def.name}</strong> will be able to:
              </p>
            </div>
            <ul className="space-y-1.5" aria-label="Permissions granted">
              {def.scopes.map((scope) => (
                <li
                  key={scope}
                  className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                  <span className="text-xs leading-snug">{scope}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Radio className="h-3 w-3 shrink-0" aria-hidden />
              Scope labels are simulated for this sandbox — nothing leaves the workspace.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Post to channel</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="w-full rounded-lg" aria-label="Destination channel">
                  <SelectValue placeholder="Choose a channel" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {postable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        {c.kind === 'private' ? (
                          <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                        ) : (
                          <Hash className="h-3 w-3 text-muted-foreground" aria-hidden />
                        )}
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Connectors post as {def.name} — they can&apos;t be added to DMs.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs">Event subscriptions</Label>
                <span className="text-[10px] text-muted-foreground">
                  {enabledEvents.length} of {def.events.length} on
                </span>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {def.events.map((event) => (
                  <label
                    key={event.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-100 hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={!!subs[event.id]}
                      onCheckedChange={(checked) =>
                        setSubs((prev) => ({ ...prev, [event.id]: checked === true }))
                      }
                      className="mt-0.5"
                      aria-label={event.label}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{event.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        {event.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setStep((s) => s - 1)}
              className="rounded-lg"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              type="button"
              disabled={step === 1 && !accountOk}
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!channelId || busy || enabledEvents.length === 0}
              onClick={() => void connect()}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Connecting…
                </>
              ) : (
                <>
                  Connect {channel ? `to #${channel.name}` : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
