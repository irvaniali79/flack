'use client'
// Cutover validation — migration phase 3. Compares the imported Slack history
// against what now lives in the workspace, produces a confidence score +
// readiness checks, and offers a downloadable sign-off report (Markdown).
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Download,
  Gauge,
  Link2,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'

type CutoverCheck = {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

type CutoverChannelRow = {
  channelId: string
  slackId: string | null
  name: string
  kind: string
  importedMessages: number
  totalMessages: number
  newSinceImport: number
  threads: number
  reactions: number
  pins: number
  members: number
  lastActivity: string | null
}

type CutoverReport = {
  generatedAt: string
  importsFound: number
  lastImportAt: string | null
  totals: {
    importedChannels: number
    importedMessages: number
    importedThreads: number
    importedReactions: number
    linkedUsers: number
    unlinkedUsers: number
    botUsers: number
  }
  channels: CutoverChannelRow[]
  users: { name: string; email: string; kind: string; slackLinked: boolean; messageCount: number }[]
  deepLinkSamples: { slack: string; ours: string; label: string }[]
  checks: CutoverCheck[]
  confidence: number
}

function confidenceTone(score: number) {
  if (score >= 80) return { ring: 'text-emerald-500', label: 'Ready to cut over', bar: 'bg-emerald-500' }
  if (score >= 50) return { ring: 'text-amber-500', label: 'Almost there', bar: 'bg-amber-500' }
  return { ring: 'text-rose-500', label: 'Not ready yet', bar: 'bg-rose-500' }
}

export function CutoverSection() {
  const channels = useChatStore((s) => s.channels)
  const setView = useViewStore((s) => s.setView)

  const [report, setReport] = useState<CutoverReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cutover/report')
      const data = (await res.json()) as { report?: CutoverReport; error?: string }
      if (!res.ok || !data.report) throw new Error(data.error ?? `Failed (HTTP ${res.status})`)
      setReport(data.report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openChannel = (channelId: string) => {
    setView('chat')
    void useChatStore.getState().openChannel(channelId)
  }

  if (loading && !report) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Building cutover report…
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
        <p className="flex items-center gap-2 font-semibold">
          <CircleX className="h-4 w-4" aria-hidden />
          {error}
        </p>
        <Button size="sm" variant="outline" className="mt-3 rounded-lg" onClick={() => void load(true)}>
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
          Retry
        </Button>
      </div>
    )
  }

  if (!report) return null

  const tone = confidenceTone(report.confidence)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* headline: confidence gauge */}
      <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/10 via-card to-card p-4">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-2xl" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <Gauge className={cn('h-16 w-16', tone.ring)} aria-hidden />
              <span className="absolute text-lg font-black tabular-nums">{report.confidence}</span>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[15px] font-bold">
                Cutover confidence
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-full text-[10px] font-semibold',
                    report.confidence >= 80
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : report.confidence >= 50
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                  )}
                >
                  {tone.label}
                </Badge>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {report.importsFound > 0
                  ? `${report.importsFound} import run${report.importsFound === 1 ? '' : 's'} found · last ${formatRelativeTime(report.lastImportAt ?? '')}`
                  : 'No Slack imports found yet — run phase 1 first (Import tab).'}
              </p>
              <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', tone.bar)}
                  style={{ width: `${report.confidence}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => void load(true)}>
              <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
              Re-run checks
            </Button>
            <a href="/api/admin/cutover/report?format=markdown" download>
              <Button size="sm" className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700">
                <Download className="mr-1 h-3 w-3" aria-hidden />
                Download report
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* totals strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Channels', value: report.totals.importedChannels },
          { label: 'Messages', value: report.totals.importedMessages },
          { label: 'Thread replies', value: report.totals.importedThreads },
          { label: 'Reactions', value: report.totals.importedReactions },
          { label: 'Linked users', value: report.totals.linkedUsers },
          { label: 'Bots', value: report.totals.botUsers },
          { label: 'Unlinked users', value: report.totals.unlinkedUsers },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-xl font-bold leading-none tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[11px] font-semibold">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* readiness checks */}
      <div className="overflow-hidden rounded-xl border border-border">
        <p className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3.5 py-2.5 text-[13px] font-semibold">
          <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Readiness checks
        </p>
        <div className="divide-y divide-border/60">
          {report.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
              {check.status === 'pass' ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
              ) : check.status === 'warn' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug">{check.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* channel fidelity table */}
      {report.channels.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3.5 py-2.5 text-[13px] font-semibold">
            <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Channel fidelity — imported vs current
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3.5 py-2 font-semibold">Channel</th>
                  <th className="px-3.5 py-2 font-semibold">Slack id</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Imported</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Now</th>
                  <th className="px-3.5 py-2 text-right font-semibold">New</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Threads</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Reacts</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Last activity</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {report.channels.map((c) => (
                  <tr key={c.channelId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-3.5 py-2.5 font-semibold">{c.kind === 'dm' || c.kind === 'group_dm' ? c.name : `#${c.name}`}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">{c.slackId ?? '—'}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{c.importedMessages}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold">{c.totalMessages}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">
                      {c.newSinceImport > 0 ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{c.newSinceImport}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">{c.threads}</td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">{c.reactions}</td>
                    <td className="px-3.5 py-2.5 text-right text-xs text-muted-foreground">
                      {c.lastActivity ? formatRelativeTime(c.lastActivity) : 'never'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {channels.find((x) => x.id === c.channelId) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-lg px-2 text-xs text-fuchsia-700 hover:bg-fuchsia-500/10 dark:text-fuchsia-400"
                          onClick={() => openChannel(c.channelId)}
                        >
                          Open →
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* user mapping */}
      <div className="overflow-hidden rounded-xl border border-border">
        <p className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3.5 py-2.5 text-[13px] font-semibold">
          <UsersRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          User mapping
        </p>
        <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
          {report.users.map((u) => (
            <div key={u.email} className="flex items-center gap-3 px-3.5 py-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-semibold">{u.name}</span>
              <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">{u.email}</span>
              {u.name.includes('(Slack bot)') && (
                <Badge variant="secondary" className="rounded px-1.5 text-[10px]">bot</Badge>
              )}
              <span className="tabular-nums text-muted-foreground">{u.messageCount} msgs</span>
              {u.slackLinked ? (
                <Badge className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                  linked
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded px-1.5 text-[10px] text-muted-foreground">
                  local
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* deep-link mapping samples */}
      {report.deepLinkSamples.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Deep-link mapping samples
          </p>
          <p className="mt-1 mb-2 text-[11px] text-muted-foreground">
            Redirect old Slack links during cutover week — pattern: channel id + message ts map to this workspace.
          </p>
          <div className="space-y-1.5">
            {report.deepLinkSamples.map((link) => (
              <div key={link.slack} className="rounded-lg border border-border bg-background/70 px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{link.label}</p>
                <div className="mt-1 flex flex-col gap-1 font-mono text-[11px] leading-relaxed sm:flex-row sm:items-center sm:gap-2">
                  <code className="truncate rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">{link.slack}</code>
                  <span className="hidden text-muted-foreground sm:inline">→</span>
                  <code className="truncate rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">{link.ours}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Report generated {formatRelativeTime(report.generatedAt)} · read-only — validation never mutates data.
      </p>
    </motion.div>
  )
}
