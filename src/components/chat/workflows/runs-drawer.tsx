'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  MinusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/time'
import type { WorkflowDTO, WorkflowRunDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<WorkflowRunDTO['status'], string> = {
  done: 'bg-emerald-500',
  failed: 'bg-rose-500',
  running: 'bg-amber-500 animate-pulse',
}

const STATUS_TEXT: Record<WorkflowRunDTO['status'], string> = {
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-rose-600 dark:text-rose-400',
  running: 'text-amber-600 dark:text-amber-400',
}

function durationOf(run: WorkflowRunDTO): string {
  if (!run.finishedAt) return 'running…'
  const seconds = (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
  return seconds < 1 ? `${(seconds * 1000).toFixed(0)}ms` : `${seconds.toFixed(1)}s`
}

export function RunsDrawer({
  workflow,
  onClose,
}: {
  workflow: WorkflowDTO | null
  onClose: () => void
}) {
  const [runs, setRuns] = useState<WorkflowRunDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!workflow) return
    setRefreshing(true)
    try {
      const data = await api<{ runs: WorkflowRunDTO[] }>(`/api/workflows/${workflow.id}/runs?limit=20`)
      setRuns(data.runs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load run history')
    } finally {
      setRefreshing(false)
    }
  }, [workflow])

  useEffect(() => {
    setRuns(null)
    setExpanded(null)
    setError(null)
    void load()
  }, [load])

  return (
    <Sheet open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-emerald-600" aria-hidden />
            Run history
          </SheetTitle>
          <SheetDescription className="truncate">
            {workflow ? `“${workflow.name}” — last ${20} runs, newest first` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {error ? (
            <p className="px-2 py-6 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : runs === null ? (
            <div className="space-y-2 px-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
                <History className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-xs text-muted-foreground">
                Trigger the workflow or hit “Run now” to see history here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => {
                const isOpen = expanded === run.id
                return (
                  <li key={run.id} className="overflow-hidden rounded-xl border border-border">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : run.id)}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-accent"
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          STATUS_DOT[run.status] ?? 'bg-muted-foreground',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {run.triggerLabel ?? 'Workflow run'}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn('font-medium capitalize', STATUS_TEXT[run.status])}>
                            {run.status}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{formatRelativeTime(run.startedAt)}</span>
                          <span aria-hidden>·</span>
                          <span>{durationOf(run)}</span>
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150',
                          isOpen && 'rotate-90',
                        )}
                        aria-hidden
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 px-3 py-3">
                        {run.error && (
                          <p className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400">
                            {run.error}
                          </p>
                        )}
                        {run.logs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No step logs recorded.</p>
                        ) : (
                          <ol className="relative ml-1.5 space-y-3 border-l border-border pl-4">
                            {run.logs.map((log, index) => (
                              <li key={`${run.id}-${index}`} className="relative">
                                <span
                                  className="absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background"
                                  aria-hidden
                                >
                                  {log.status === 'ok' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : log.status === 'failed' ? (
                                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                  ) : (
                                    <MinusCircle className="h-3.5 w-3.5 text-amber-500" />
                                  )}
                                </span>
                                <p className="text-xs font-semibold leading-tight">
                                  {log.label ?? log.step}
                                </p>
                                {log.detail && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">{log.detail}</p>
                                )}
                                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                                  {new Date(log.at).toLocaleTimeString()}
                                </p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={refreshing || !workflow}
            className="rounded-lg"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Refresh
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
