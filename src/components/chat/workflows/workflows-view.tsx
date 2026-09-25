'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import type { WorkflowDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { humanizeTrigger, triggerIconFor } from './trigger-label'
import { WorkflowBuilder } from './workflow-builder'
import { RunsDrawer } from './runs-drawer'

export function WorkflowsView() {
  const me = useChatStore((s) => s.me)
  const channels = useChatStore((s) => s.channels)
  const setView = useViewStore((s) => s.setView)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const [workflows, setWorkflows] = useState<WorkflowDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<WorkflowDTO | null>(null)
  const [runsFor, setRunsFor] = useState<WorkflowDTO | null>(null)
  const [deleting, setDeleting] = useState<WorkflowDTO | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ workflows: WorkflowDTO[] }>('/api/workflows')
      setWorkflows(data.workflows)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load workflows')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnabled = async (workflow: WorkflowDTO) => {
    setWorkflows((prev) =>
      prev ? prev.map((w) => (w.id === workflow.id ? { ...w, enabled: !w.enabled } : w)) : prev,
    )
    try {
      await api(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        body: { enabled: !workflow.enabled },
      })
    } catch (err) {
      // revert
      setWorkflows((prev) =>
        prev ? prev.map((w) => (w.id === workflow.id ? { ...w, enabled: workflow.enabled } : w)) : prev,
      )
      toast.error(err instanceof Error ? err.message : 'Could not update workflow')
    }
  }

  const runNow = async (workflow: WorkflowDTO) => {
    if (runningId) return
    setRunningId(workflow.id)
    try {
      await api(`/api/workflows/${workflow.id}/run`, { method: 'POST' })
      toast.success(`Workflow started — “${workflow.name}”`)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run workflow')
    } finally {
      setRunningId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting || busyDelete) return
    setBusyDelete(true)
    try {
      await api(`/api/workflows/${deleting.id}`, { method: 'DELETE' })
      toast.success(`Deleted “${deleting.name}”`)
      setWorkflows((prev) => (prev ? prev.filter((w) => w.id !== deleting.id) : prev))
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete workflow')
    } finally {
      setBusyDelete(false)
    }
  }

  const openEditor = (workflow: WorkflowDTO | null) => {
    setEditing(workflow)
    setBuilderOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('chat')}
          className="h-8 shrink-0 rounded-lg px-2 text-muted-foreground"
          aria-label="Back to chat"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Chat</span>
        </Button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
          <Zap className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">Workflows</h1>
          <p className="truncate text-xs text-muted-foreground">
            Automate the boring stuff — triggers, actions and AI steps.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => openEditor(null)}
            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" aria-hidden /> New workflow
          </Button>
        )}
      </header>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {error ? (
          <div className="mx-auto max-w-md rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
            <div className="mt-3">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </div>
        ) : workflows === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="text-lg font-bold">Automate the boring stuff</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              No workflows yet. Create one to react to messages, celebrate deploys, or put an AI
              agent on watch.
            </p>
            {isAdmin && (
              <Button
                onClick={() => openEditor(null)}
                className="mt-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" aria-hidden /> Create your first workflow
              </Button>
            )}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow) => {
              const TriggerIcon = triggerIconFor(workflow.triggerType)
              return (
                <article
                  key={workflow.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-emerald-500/40 hover:shadow-sm',
                    !workflow.enabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          workflow.enabled
                            ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Zap className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold leading-tight">{workflow.name}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {workflow.description ?? 'No description'}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 rounded-full text-[10px] font-semibold"
                      title={`${workflow.runCount} run${workflow.runCount === 1 ? '' : 's'}`}
                    >
                      {workflow.runCount} {workflow.runCount === 1 ? 'run' : 'runs'}
                    </Badge>
                  </div>

                  <p className="flex items-start gap-1.5 rounded-lg bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <TriggerIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      {humanizeTrigger(workflow.triggerType, workflow.triggerConfig, channels)}
                    </span>
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Switch
                          checked={workflow.enabled}
                          onCheckedChange={() => void toggleEnabled(workflow)}
                          aria-label={`${workflow.enabled ? 'Disable' : 'Enable'} ${workflow.name}`}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      ) : (
                        <span
                          className={cn(
                            'text-xs font-medium',
                            workflow.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                          )}
                        >
                          {workflow.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {workflow.steps.length} {workflow.steps.length === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Run ${workflow.name} now`}
                        title="Run now"
                        disabled={runningId === workflow.id}
                        onClick={() => void runNow(workflow)}
                        className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
                      >
                        {runningId === workflow.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Play className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Run history for ${workflow.name}`}
                        title="History"
                        onClick={() => setRunsFor(workflow)}
                        className="h-8 w-8 rounded-lg"
                      >
                        <History className="h-4 w-4" aria-hidden />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${workflow.name}`}
                            title="Edit"
                            onClick={() => openEditor(workflow)}
                            className="h-8 w-8 rounded-lg"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${workflow.name}`}
                            title="Delete"
                            onClick={() => setDeleting(workflow)}
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-600/10 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* builder dialog */}
      <WorkflowBuilder
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open)
          if (!open) setEditing(null)
        }}
        workflow={editing}
        onSaved={() => void load()}
      />

      {/* run history drawer */}
      <RunsDrawer workflow={runsFor} onClose={() => setRunsFor(null)} />

      {/* delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the workflow and its run history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
            >
              {busyDelete ? 'Deleting…' : 'Delete workflow'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
