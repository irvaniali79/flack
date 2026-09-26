'use client'
// AI summary dialog ("Catch me up" for channels, "Thread summary" for threads)
// + the trigger buttons used by channel-header.tsx and thread-panel.tsx.
// SummaryTrigger owns the fetch state (setState only happens in async
// callbacks — the phase is derived during render); SummaryDialog is
// purely presentational so it can be reused anywhere.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { MarkdownBody } from '@/lib/markdown'

export type SummaryPhase = 'idle' | 'loading' | 'done' | 'error'

// ─── presentational dialog ───────────────────────────────────────────────────

interface SummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  loadingLabel?: string
  phase: SummaryPhase
  summary: string
  onRetry: () => void
}

export function SummaryDialog({
  open,
  onOpenChange,
  title,
  loadingLabel = 'Reading the channel…',
  phase,
  summary,
  onRetry,
}: SummaryDialogProps) {
  const users = useChatStore((s) => s.users)
  const channels = useChatStore((s) => s.channels)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(85vh/var(--ui-scale))] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>AI-generated recap — verify anything important.</DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="space-y-3" aria-busy="true" aria-label={loadingLabel}>
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {loadingLabel}
            </p>
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              The summary didn&rsquo;t come through. Please try again.
            </p>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
            </Button>
          </div>
        )}

        {phase === 'done' && (
          <MarkdownBody body={summary} users={users} channels={channels} className="text-sm" />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── trigger buttons (own the fetch + loading state) ─────────────────────────

interface SummaryRequest {
  key: string
  summary?: string
  error?: boolean
}

interface SummaryTriggerProps {
  channelId: string | null
  /** When set, summarize this thread (root id) instead of the channel. */
  threadOf?: string | null
  /** "labeled" = Catch me up pill (channel header); "icon" = compact icon (thread panel). */
  variant?: 'labeled' | 'icon'
  title: string
  loadingLabel?: string
}

export function SummaryTrigger({
  channelId,
  threadOf,
  variant = 'labeled',
  title,
  loadingLabel,
}: SummaryTriggerProps) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [request, setRequest] = useState<SummaryRequest | null>(null)

  // The active request identity: any change (open, target, retry) invalidates.
  const key = `${channelId ?? ''}|${threadOf ?? ''}|${attempt}|${open}`
  const current = open && request?.key === key ? request : null
  const phase: SummaryPhase = !open ? 'idle' : current ? (current.error ? 'error' : 'done') : 'loading'
  const loading = phase === 'loading'

  useEffect(() => {
    if (!open || !channelId) return
    let cancelled = false
    const requestKey = `${channelId}|${threadOf ?? ''}|${attempt}|${open}`
    api<{ summary: string }>('/api/ai/summary', {
      method: 'POST',
      body: { channelId, threadOf: threadOf ?? undefined },
    })
      .then((data) => {
        if (!cancelled) setRequest({ key: requestKey, summary: data.summary })
      })
      .catch((err) => {
        if (cancelled) return
        setRequest({ key: requestKey, error: true })
        toast.error(err instanceof Error ? err.message : 'Could not generate a summary')
      })
    return () => {
      cancelled = true
    }
  }, [open, channelId, threadOf, attempt])

  const dialog = (
    <SummaryDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      loadingLabel={loadingLabel}
      phase={phase}
      summary={current?.summary ?? ''}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          aria-label="Summarize thread"
          title={loading ? 'Summarizing…' : 'Summarize thread'}
          disabled={!channelId || loading}
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-emerald-500/10 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-emerald-400"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
        </button>
        {dialog}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Catch me up — AI summary of this channel"
        title={loading ? 'Summarizing…' : 'AI summary of recent messages'}
        disabled={!channelId || loading}
        onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        <span className="hidden sm:inline">Catch me up</span>
      </button>
      {dialog}
    </>
  )
}
