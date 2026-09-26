'use client'
// "Manage agents" dialog: list every AI agent with its facet badges, and let
// admins create / edit / deactivate / delete them (form swaps in as a view).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import type { AgentDTO } from '@/lib/types'
import { UserAvatar } from '../avatar'
import { AgentForm, type AgentWithMeta } from './agent-form'

const iconAction =
  'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:opacity-40'

function AgentBadge({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'emerald' | 'zinc' }) {
  return (
    <span
      className={
        tone === 'amber'
          ? 'flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400'
          : tone === 'emerald'
            ? 'flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300'
            : 'flex items-center gap-0.5 rounded bg-muted px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted-foreground'
      }
    >
      {children}
    </span>
  )
}

interface AgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentDialog({ open, onOpenChange }: AgentDialogProps) {
  const me = useChatStore((s) => s.me)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const [agents, setAgents] = useState<AgentWithMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<AgentWithMeta | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  /** Push the fresh agent list into the store (sidebar agents + user directory). */
  const syncStore = useCallback((list: AgentWithMeta[], membershipsChanged: boolean) => {
    const active: AgentDTO[] = list
      .filter((a) => a.isActive)
      .map((a) => ({
        id: a.id,
        userId: a.userId,
        handle: a.handle,
        description: a.description,
        systemPrompt: a.systemPrompt,
        chatable: a.chatable,
        isActive: a.isActive,
        model: a.model,
        rateLimitPerHour: a.rateLimitPerHour,
        scopeChannelIds: a.scopeChannelIds,
        tools: a.tools,
        invocations: a.invocations,
        user: a.user,
      }))
    const usersById = new Map(useChatStore.getState().users.map((u) => [u.id, u]))
    for (const agent of list) {
      if (agent.user.isActive) usersById.set(agent.user.id, agent.user)
      else usersById.delete(agent.user.id)
    }
    useChatStore.setState({ agents: active, users: [...usersById.values()] })
    if (membershipsChanged) void useChatStore.getState().fetchChannels()
  }, [])

  const fetchAgents = useCallback(
    async (opts?: { membershipsChanged?: boolean }) => {
      setLoading(true)
      try {
        const data = await api<{ agents: AgentWithMeta[] }>('/api/agents')
        setAgents(data.agents)
        syncStore(data.agents, !!opts?.membershipsChanged)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load agents')
      } finally {
        setLoading(false)
      }
    },
    [syncStore],
  )

  useEffect(() => {
    if (open) {
      setView('list')
      setEditing(null)
      void fetchAgents()
    }
  }, [open, fetchAgents])

  const toggleActive = async (agent: AgentWithMeta) => {
    setBusyId(agent.id)
    try {
      await api(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: { isActive: !agent.isActive, chatable: !agent.isActive },
      })
      toast.success(agent.isActive ? `Deactivated @${agent.handle}` : `Reactivated @${agent.handle}`)
      await fetchAgents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the agent')
    } finally {
      setBusyId(null)
    }
  }

  const removeAgent = async (agent: AgentWithMeta) => {
    setBusyId(agent.id)
    try {
      const res = await api<{ deleted?: boolean; disabled?: boolean }>(`/api/agents/${agent.id}`, {
        method: 'DELETE',
      })
      toast.success(
        res.deleted
          ? `Deleted @${agent.handle}`
          : `@${agent.handle} has messages — deactivated instead to keep history`,
      )
      await fetchAgents({ membershipsChanged: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the agent')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(85vh/var(--ui-scale))] overflow-y-auto rounded-2xl sm:max-w-lg">
        {view === 'form' ? (
          <AgentForm
            key={editing?.id ?? 'new'}
            agent={editing}
            onSaved={() => {
              setView('list')
              setEditing(null)
              void fetchAgents({ membershipsChanged: !editing })
            }}
            onCancel={() => {
              setView('list')
              setEditing(null)
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden /> AI agents
                  </DialogTitle>
                  <DialogDescription>
                    {isAdmin
                      ? 'Teammates that answer when mentioned or chatted with.'
                      : 'Read-only — ask an admin to change agent settings.'}
                  </DialogDescription>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    className="shrink-0 gap-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => {
                      setEditing(null)
                      setView('form')
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> New agent
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-2.5">
              {loading && agents.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading agents" />
                </div>
              ) : agents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Bot className="h-8 w-8 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm text-muted-foreground">No agents yet</p>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground/70">
                      Create one to answer questions automatically.
                    </p>
                  )}
                </div>
              ) : (
                agents.map((agent) => (
                  <article
                    key={agent.id}
                    className="rounded-xl border border-border p-3.5 transition-colors duration-150 hover:border-emerald-500/30"
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar user={agent.user} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">{agent.user.name}</p>
                          <AgentBadge>
                            <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI Agent
                          </AgentBadge>
                          {agent.chatable ? (
                            <AgentBadge tone="emerald">
                              <MessageSquare className="h-2.5 w-2.5" aria-hidden /> Chatable
                            </AgentBadge>
                          ) : (
                            <AgentBadge tone="zinc">
                              <MessageSquareOff className="h-2.5 w-2.5" aria-hidden /> Muted
                            </AgentBadge>
                          )}
                          {!agent.isActive && <AgentBadge tone="zinc">Inactive</AgentBadge>}
                        </div>
                        <p className="text-xs text-muted-foreground">@{agent.handle}</p>
                        {agent.description && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-foreground/75">
                            {agent.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="h-3 w-3" aria-hidden />
                            {agent.invocations} {agent.invocations === 1 ? 'invocation' : 'invocations'}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px]">
                            {agent.model}
                          </span>
                          <span>{agent.rateLimitPerHour}/h limit</span>
                          <span>
                            {agent.scopeChannelIds.length === 0
                              ? 'All channels'
                              : `${agent.scopeChannelIds.length} channel${agent.scopeChannelIds.length === 1 ? '' : 's'}`}
                          </span>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={`Edit @${agent.handle}`}
                            title="Edit"
                            className={iconAction}
                            onClick={() => {
                              setEditing(agent)
                              setView('form')
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={agent.isActive ? `Deactivate @${agent.handle}` : `Reactivate @${agent.handle}`}
                            title={agent.isActive ? 'Deactivate' : 'Reactivate'}
                            disabled={busyId === agent.id}
                            className={iconAction}
                            onClick={() => void toggleActive(agent)}
                          >
                            {busyId === agent.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Power className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </button>
                          {agent.messageCount === 0 && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Delete @${agent.handle}`}
                                  title="Delete"
                                  disabled={busyId === agent.id}
                                  className={`${iconAction} hover:text-rose-600 dark:hover:text-rose-400`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete @{agent.handle}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes the agent and its workspace
                                    membership. This agent has no messages, so nothing is lost.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
                                    onClick={() => void removeAgent(agent)}
                                  >
                                    Delete agent
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
