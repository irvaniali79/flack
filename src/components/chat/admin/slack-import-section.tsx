'use client'
// Slack export import — the "historical import" phase of the Slack migration
// story (the compat API covers "parallel run"). Upload a workspace-export ZIP
// (or generate a sample) and channels/users/history import with timestamps,
// threads, reactions and mrkdwn converted faithfully.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileArchive,
  History,
  KeyRound,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Package,
  Sparkles,
  UploadCloud,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'

type ImportSummary = {
  ok: true
  usersMatched: number
  usersCreated: number
  botsImported: number
  channelsImported: number
  channelsSkipped: number
  messagesImported: number
  threadsImported: number
  reactionsImported: number
  messagesSkippedSubtype: number
  missingSenderMessages: number
  channels: { name: string; kind: string; messages: number }[]
  generatedPasswords: { email: string; password: string }[]
  warnings: string[]
}

type ImportRun = {
  id: string
  at: string
  actor: string | null
  summary: {
    usersMatched?: number
    usersCreated?: number
    channelsImported?: number
    messagesImported?: number
    threadsImported?: number
    reactionsImported?: number
  } | null
}

type Phase = 'idle' | 'importing' | 'done'

export function SlackImportSection() {
  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const channels = useChatStore((s) => s.channels)
  const setView = useViewStore((s) => s.setView)

  const [phase, setPhase] = useState<Phase>('idle')
  const [busyLabel, setBusyLabel] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [runs, setRuns] = useState<ImportRun[] | null>(null)
  const [passwordsRevealed, setPasswordsRevealed] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/slack-import')
      if (!res.ok) return
      const data = (await res.json()) as { runs?: ImportRun[] }
      setRuns(data.runs ?? [])
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const runImport = useCallback(
    async (file: File, label: string) => {
      if (phase === 'importing') return
      setPhase('importing')
      setBusyLabel(label)
      setError(null)
      setPasswordsRevealed(false)
      const startedAt = performance.now()
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/admin/slack-import', { method: 'POST', body: form })
        const data = (await res.json()) as { summary?: ImportSummary; error?: string }
        if (!res.ok || !data.summary) {
          throw new Error(data.error ?? `Import failed (HTTP ${res.status})`)
        }
        setSummary(data.summary)
        setPhase('done')
        const secs = ((performance.now() - startedAt) / 1000).toFixed(1)
        toast.success(`Imported ${data.summary.channelsImported} channels · ${data.summary.messagesImported} messages`, {
          description: `History preserved with original timestamps · ${secs}s`,
        })
        // New channels should appear in the sidebar right away
        void fetchChannels()
        void loadRuns()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed')
        setPhase('idle')
        toast.error('Slack import failed', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [phase, fetchChannels, loadRuns],
  )

  const onPickFile = (file: File | undefined | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Expected a .zip export file')
      return
    }
    void runImport(file, `Importing ${file.name}…`)
  }

  const importSample = async () => {
    if (phase === 'importing') return
    setPhase('importing')
    setBusyLabel('Generating sample export…')
    setError(null)
    try {
      const res = await fetch('/api/admin/slack-import/sample')
      if (!res.ok) throw new Error('Could not generate the sample export')
      const blob = await res.blob()
      const file = new File([blob], 'flack-sample-slack-export.zip', { type: 'application/zip' })
      await runImport(file, 'Importing sample export…')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sample import failed')
      setPhase('idle')
    }
  }

  const copyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password)
      setCopiedPassword(password)
      setTimeout(() => setCopiedPassword(null), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  const newChannelCount = summary ? summary.channels.length : 0
  const importedChannelNames = new Set(summary?.channels.map((c) => c.name) ?? [])
  const importedChannels = channels.filter((c) => importedChannelNames.has(c.name))

  return (
    <section aria-labelledby="slack-import-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">
            <FileArchive className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <h3 id="slack-import-heading" className="text-sm font-bold">
              Import from Slack
            </h3>
            <p className="text-xs text-muted-foreground">
              Bring your workspace history over — channels, members, threads, reactions and all.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 rounded-full border-fuchsia-500/30 bg-fuchsia-500/10 px-2 text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-400">
          <Sparkles className="h-3 w-3" aria-hidden /> Migration · phase 1 of 3
        </Badge>
      </div>

      {/* migration map */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">1</span>
          Historical import
        </span>
        <ArrowRight className="h-3 w-3" aria-hidden />
        <span className="flex items-center gap-1.5">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted">2</span>
          Parallel run <span className="text-muted-foreground/70">— Slack bot API ✅</span>
        </span>
        <ArrowRight className="h-3 w-3" aria-hidden />
        <span className="flex items-center gap-1.5">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted">3</span>
          Cutover
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {/* dropzone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload Slack export ZIP"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                onPickFile(e.dataTransfer.files?.[0])
              }}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-all duration-200',
                dragging
                  ? 'border-fuchsia-500/60 bg-fuchsia-500/10 scale-[1.01]'
                  : 'border-border bg-muted/30 hover:border-fuchsia-500/40 hover:bg-muted/50',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200',
                  dragging ? 'scale-110 bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400' : 'bg-muted text-muted-foreground group-hover:scale-105',
                )}
              >
                <UploadCloud className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-semibold">
                {dragging ? 'Drop the export here' : 'Drag a Slack export .zip here'}
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Create it in Slack: <span className="font-mono text-[11px]">Settings → Import/Export → Export</span>.
                Members are matched by email; timestamps, threads and reactions are preserved.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  onPickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>

            {/* sample */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-[13px] font-semibold">No export handy?</p>
                  <p className="text-xs text-muted-foreground">
                    Run a realistic sample — 6 members, 2 channels, threads, reactions, a bot and a deleted account.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg gap-1.5 border-fuchsia-500/30 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10"
                onClick={() => void importSample()}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Import sample
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-700 dark:text-rose-300" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </motion.div>
        )}

        {phase === 'importing' && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/60 px-6 py-12"
          >
            <Loader2 className="h-6 w-6 animate-spin text-fuchsia-600 dark:text-fuchsia-400" aria-hidden />
            <p className="text-sm font-semibold">{busyLabel}</p>
            <p className="text-xs text-muted-foreground">
              Matching members by email, converting mrkdwn, rebuilding threads — this can take a minute for large exports.
            </p>
          </motion.div>
        )}

        {phase === 'done' && summary && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* result header */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Import complete — history preserved
              </p>
              <div className="flex gap-2">
                {importedChannels.slice(0, 3).map((c) => (
                  <Badge key={c.id} variant="secondary" className="rounded-full bg-background/80 text-[10px] font-semibold">
                    #{c.name}
                  </Badge>
                ))}
                {newChannelCount > 3 && (
                  <Badge variant="secondary" className="rounded-full bg-background/80 text-[10px] font-semibold">
                    +{newChannelCount - 3}
                  </Badge>
                )}
              </div>
            </div>

            {/* stat grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { icon: UsersRound, label: 'Users matched', value: summary.usersMatched, hint: 'by email' },
                { icon: UsersRound, label: 'Users created', value: summary.usersCreated, hint: 'passwords below' },
                { icon: Bot, label: 'Bots', value: summary.botsImported, hint: 'kept attribution' },
                { icon: Package, label: 'Channels', value: summary.channelsImported, hint: `${summary.channelsSkipped} skipped` },
                { icon: MessageSquare, label: 'Messages', value: summary.messagesImported, hint: `${summary.messagesSkippedSubtype} noise skipped` },
                { icon: MessagesSquare, label: 'Thread replies', value: summary.threadsImported, hint: `${summary.reactionsImported} reactions` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card/60 p-3">
                  <stat.icon className="mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                  <p className="text-xl font-bold leading-none tabular-nums">{stat.value}</p>
                  <p className="mt-1 text-[11px] font-semibold">{stat.label}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.hint}</p>
                </div>
              ))}
            </div>

            {/* per-channel */}
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3.5 py-2 font-semibold">Channel</th>
                    <th className="px-3.5 py-2 font-semibold">Type</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Messages</th>
                    <th className="hidden px-3.5 py-2 text-right font-semibold sm:table-cell">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.channels.map((c) => {
                    const imported = channels.find((x) => x.name === c.name)
                    return (
                      <tr key={c.name} className="border-b border-border/60 last:border-0">
                        <td className="px-3.5 py-2.5 font-semibold">#{c.name}</td>
                        <td className="px-3.5 py-2.5">
                          <Badge variant="outline" className="rounded px-1.5 text-[10px] capitalize">{c.kind}</Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">{c.messages}</td>
                        <td className="hidden px-3.5 py-2.5 text-right sm:table-cell">
                          {imported ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 rounded-lg px-2 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                              onClick={() => {
                                setView('chat')
                                void useChatStore.getState().openChannel(imported.id)
                              }}
                            >
                              View in sidebar →
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* generated passwords */}
            {summary.generatedPasswords.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Temporary passwords for created members
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg px-2.5 text-[11px]"
                    onClick={() => setPasswordsRevealed((v) => !v)}
                  >
                    <Eye className="h-3 w-3" aria-hidden />
                    {passwordsRevealed ? 'Hide' : 'Reveal'}
                  </Button>
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                  Shown once — share securely with each member so they can sign in and set their own password.
                </p>
                <div className="space-y-1.5">
                  {summary.generatedPasswords.map((p) => (
                    <div
                      key={p.email}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-background/70 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-xs font-medium">{p.email}</span>
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        {passwordsRevealed ? (
                          <>
                            <code className="rounded bg-muted px-1.5 py-0.5">{p.password}</code>
                            <button
                              type="button"
                              aria-label={`Copy password for ${p.email}`}
                              onClick={() => void copyPassword(p.password)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              {copiedPassword === p.password ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </button>
                          </>
                        ) : (
                          <code className="select-none rounded bg-muted px-1.5 py-0.5 text-transparent [text-shadow:0_0_7px_currentColor]">
                            {'•'.repeat(16)}
                          </code>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* warnings */}
            {(summary.warnings.length > 0 || summary.missingSenderMessages > 0) && (
              <div className="space-y-1.5 rounded-xl border border-border bg-card/60 p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  Notes
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {summary.missingSenderMessages > 0 && (
                    <li>
                      {summary.missingSenderMessages} message{summary.missingSenderMessages === 1 ? '' : 's'} from
                      deleted Slack accounts — shown as “Unknown” author.
                    </li>
                  )}
                  {summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  <li>DMs and file attachments are not part of this import (files live behind Slack auth).</li>
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  setPhase('idle')
                  setSummary(null)
                }}
              >
                Import another export
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* import history */}
      {runs && runs.length > 0 && phase !== 'importing' && (
        <div className="rounded-xl border border-border bg-card/60">
          <p className="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5 text-[13px] font-semibold">
            <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Import history
          </p>
          <div className="divide-y divide-border/60">
            {runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                <span className="font-semibold">
                  {run.summary?.channelsImported ?? '?'} channels · {run.summary?.messagesImported ?? '?'} messages
                </span>
                <span className="text-muted-foreground">
                  {run.summary?.usersMatched ?? 0} matched · {run.summary?.usersCreated ?? 0} created ·{' '}
                  {run.summary?.threadsImported ?? 0} threads · {run.summary?.reactionsImported ?? 0} reactions
                </span>
                <span className="ml-auto text-muted-foreground">{new Date(run.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
