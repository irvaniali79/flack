'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Bot,
  GripVertical,
  MessageSquarePlus,
  Plus,
  Send,
  SmilePlus,
  X,
  Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import type { WorkflowDTO, WorkflowStep, WorkflowStepType, WorkflowTriggerType } from '@/lib/types'
import { humanizeTrigger } from './trigger-label'

const EMOJI_QUICK_PICKS = ['👍', '✅', '🎉', '❤️', '🚀', '👀', '😄', '🙏', '🙌', '⚡']
const TEMPLATE_VARS = ['{{actor.name}}', '{{channel.name}}', '{{message.body}}', '{{message.id}}'] as const
const ANY_CHANNEL = '__any__'
const TRIGGER_CHANNEL = '__trigger__'

const STEP_TYPES: { type: WorkflowStepType; label: string; icon: typeof Send }[] = [
  { type: 'post_message', label: 'Post a message', icon: MessageSquarePlus },
  { type: 'send_dm', label: 'Send a DM', icon: Send },
  { type: 'add_reaction', label: 'Add a reaction', icon: SmilePlus },
  { type: 'run_agent', label: 'Run an AI agent', icon: Bot },
]

interface BuilderForm {
  name: string
  description: string
  triggerType: WorkflowTriggerType
  triggerConfig: { channelId?: string; emoji?: string; keyword?: string }
  steps: WorkflowStep[]
}

function emptyForm(): BuilderForm {
  return {
    name: '',
    description: '',
    triggerType: 'message_posted',
    triggerConfig: {},
    steps: [],
  }
}

function formFromWorkflow(workflow: WorkflowDTO): BuilderForm {
  return {
    name: workflow.name,
    description: workflow.description ?? '',
    triggerType: workflow.triggerType,
    triggerConfig: { ...workflow.triggerConfig },
    steps: workflow.steps.map((step) => ({
      ...step,
      config: { ...step.config },
      condition: step.condition ? { ...step.condition } : undefined,
    })),
  }
}

export function WorkflowBuilder({
  open,
  onOpenChange,
  workflow,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow: WorkflowDTO | null
  onSaved: () => void
}) {
  const channels = useChatStore((s) => s.channels)
  const users = useChatStore((s) => s.users)
  const agents = useChatStore((s) => s.agents)

  // Guarded render-time reset: reinitialize the form whenever the dialog opens
  // for a different workflow (or for "new").
  const [seed, setSeed] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [form, setForm] = useState<BuilderForm>(emptyForm)
  const [busy, setBusy] = useState(false)

  const currentSeedId = workflow?.id ?? null
  if (open !== seed.open || currentSeedId !== seed.id) {
    setSeed({ open, id: currentSeedId })
    setForm(workflow ? formFromWorkflow(workflow) : emptyForm())
  }

  const namedChannels = channels.filter((c) => c.kind === 'public' || c.kind === 'private')
  const humanMembers = users.filter((u) => u.isActive)
  const preview = humanizeTrigger(form.triggerType, form.triggerConfig, channels)

  const patch = (partial: Partial<BuilderForm>) => setForm((prev) => ({ ...prev, ...partial }))
  const patchStep = (index: number, partial: Partial<WorkflowStep>) =>
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...partial } : step)),
    }))
  const patchStepConfig = (index: number, partial: Partial<WorkflowStep['config']>) =>
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index ? { ...step, config: { ...step.config, ...partial } } : step,
      ),
    }))

  const addStep = (type: WorkflowStepType) =>
    setForm((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: crypto.randomUUID(),
          type,
          config: type === 'add_reaction' ? { targetTriggerMessage: true } : {},
        },
      ],
    }))

  const removeStep = (index: number) =>
    setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))

  const moveStep = (index: number, dir: -1 | 1) =>
    setForm((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.steps.length) return prev
      const steps = [...prev.steps]
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...prev, steps }
    })

  const insertTemplate = (index: number, variable: string) =>
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index
          ? {
              ...step,
              config: {
                ...step.config,
                ...(step.config.body !== undefined
                  ? { body: `${step.config.body ?? ''}${step.config.body ? ' ' : ''}${variable}` }
                  : { prompt: `${step.config.prompt ?? ''}${step.config.prompt ? ' ' : ''}${variable}` }),
              },
            }
          : step,
      ),
    }))

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Give the workflow a name'
    for (const [index, step] of form.steps.entries()) {
      const n = index + 1
      if (step.type === 'post_message' && !step.config.body?.trim())
        return `Step ${n}: message body is empty`
      if (step.type === 'send_dm') {
        if (!step.config.userId) return `Step ${n}: pick a DM recipient`
        if (!step.config.body?.trim()) return `Step ${n}: DM body is empty`
      }
      if (step.type === 'add_reaction' && !step.config.emoji?.trim())
        return `Step ${n}: pick an emoji to react with`
      if (step.type === 'run_agent' && !step.config.agentId) return `Step ${n}: pick an agent to run`
    }
    return null
  }

  const save = async () => {
    if (busy) return
    const problem = validate()
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        triggerType: form.triggerType,
        triggerConfig: form.triggerConfig,
        steps: form.steps.map((step) => ({
          id: step.id,
          type: step.type,
          label: step.label?.trim() || undefined,
          config: step.config,
          condition: step.condition?.keyword?.trim()
            ? { keyword: step.condition.keyword.trim() }
            : undefined,
        })),
      }
      if (workflow) {
        await api(`/api/workflows/${workflow.id}`, { method: 'PATCH', body: payload })
        toast.success(`Updated “${payload.name}”`)
      } else {
        await api('/api/workflows', { method: 'POST', body: payload })
        toast.success(`Created “${payload.name}”`)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save workflow')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" aria-hidden />
              {workflow ? 'Edit workflow' : 'New workflow'}
            </DialogTitle>
            <DialogDescription>
              Pick a trigger, then chain steps. Use template vars like{' '}
              <code className="rounded bg-muted px-1 text-[11px]">{'{{actor.name}}'}</code> in
              message bodies.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5">
            {/* basics */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="workflow-name">Name</Label>
                <Input
                  id="workflow-name"
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder="e.g. Celebrate deploys 🎉"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workflow-description">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="workflow-description"
                  value={form.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  placeholder="What does this automation do?"
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* trigger */}
            <section className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold">Trigger</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>When…</Label>
                  <Select
                    value={form.triggerType}
                    onValueChange={(value) =>
                      patch({ triggerType: value as WorkflowTriggerType })
                    }
                  >
                    <SelectTrigger className="w-full rounded-lg" aria-label="Trigger type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="message_posted">A message is posted</SelectItem>
                      <SelectItem value="reaction">A reaction is added</SelectItem>
                      <SelectItem value="button">Someone clicks Run now</SelectItem>
                      <SelectItem value="webhook">A webhook is received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.triggerType === 'message_posted' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <Select
                        value={form.triggerConfig.channelId ?? ANY_CHANNEL}
                        onValueChange={(value) =>
                          patch({
                            triggerConfig: {
                              ...form.triggerConfig,
                              channelId: value === ANY_CHANNEL ? undefined : value,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-full rounded-lg" aria-label="Trigger channel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value={ANY_CHANNEL}>Any channel</SelectItem>
                          {namedChannels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              #{channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="trigger-keyword">
                        Keyword <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="trigger-keyword"
                        value={form.triggerConfig.keyword ?? ''}
                        onChange={(event) =>
                          patch({
                            triggerConfig: { ...form.triggerConfig, keyword: event.target.value },
                          })
                        }
                        placeholder="Only when the message contains… e.g. deployed"
                        className="rounded-lg"
                      />
                    </div>
                  </>
                )}

                {form.triggerType === 'reaction' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="trigger-emoji">
                      Emoji <span className="font-normal text-muted-foreground">(blank = any)</span>
                    </Label>
                    <Input
                      id="trigger-emoji"
                      value={form.triggerConfig.emoji ?? ''}
                      onChange={(event) =>
                        patch({
                          triggerConfig: { ...form.triggerConfig, emoji: event.target.value },
                        })
                      }
                      placeholder="✅"
                      className="w-24 rounded-lg"
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {EMOJI_QUICK_PICKS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Use ${emoji}`}
                          onClick={() =>
                            patch({ triggerConfig: { ...form.triggerConfig, emoji } })
                          }
                          className="rounded-lg border border-border px-1.5 py-0.5 text-base leading-relaxed transition-colors duration-150 hover:border-emerald-500/50 hover:bg-emerald-500/5"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <p className="rounded-lg bg-emerald-500/5 px-3 py-2 text-xs italic text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {preview}…
              </p>
            </section>

            {/* steps */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Steps{' '}
                  <span className="font-normal text-muted-foreground">
                    ({form.steps.length})
                  </span>
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                    >
                      <Plus className="h-4 w-4" aria-hidden /> Add step
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl">
                    {STEP_TYPES.map(({ type, label, icon: Icon }) => (
                      <DropdownMenuItem key={type} onClick={() => addStep(type)}>
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {form.steps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  No steps yet — add what should happen when the trigger fires.
                </div>
              ) : (
                <ol className="space-y-3">
                  {form.steps.map((step, index) => (
                    <li
                      key={step.id}
                      className="rounded-xl border border-border p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          className="h-4 w-4 shrink-0 text-muted-foreground/60"
                          aria-hidden
                        />
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                        <Input
                          value={step.label ?? ''}
                          onChange={(event) => patchStep(index, { label: event.target.value })}
                          placeholder="Step label (optional)"
                          className="h-8 flex-1 rounded-lg border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                          aria-label={`Step ${index + 1} label`}
                        />
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move step up"
                            disabled={index === 0}
                            onClick={() => moveStep(index, -1)}
                            className="h-7 w-7 rounded-lg"
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move step down"
                            disabled={index === form.steps.length - 1}
                            onClick={() => moveStep(index, 1)}
                            className="h-7 w-7 rounded-lg"
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove step"
                            onClick={() => removeStep(index)}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-rose-600/10 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Type</Label>
                          <Select
                            value={step.type}
                            onValueChange={(value) =>
                              patchStep(index, {
                                type: value as WorkflowStepType,
                                config:
                                  value === 'add_reaction' ? { targetTriggerMessage: true } : {},
                              })
                            }
                          >
                            <SelectTrigger className="w-full rounded-lg" aria-label="Step type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {STEP_TYPES.map(({ type, label }) => (
                                <SelectItem key={type} value={type}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {step.type === 'post_message' && (
                          <div className="space-y-1.5">
                            <Label>Channel</Label>
                            <Select
                              value={step.config.channelId ?? TRIGGER_CHANNEL}
                              onValueChange={(value) =>
                                patchStepConfig(index, {
                                  channelId: value === TRIGGER_CHANNEL ? undefined : value,
                                })
                              }
                            >
                              <SelectTrigger className="w-full rounded-lg" aria-label="Post to channel">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value={TRIGGER_CHANNEL}>Where it was triggered</SelectItem>
                                {namedChannels.map((channel) => (
                                  <SelectItem key={channel.id} value={channel.id}>
                                    #{channel.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {step.type === 'send_dm' && (
                          <div className="space-y-1.5">
                            <Label>Send to</Label>
                            <Select
                              value={step.config.userId ?? ''}
                              onValueChange={(value) => patchStepConfig(index, { userId: value })}
                            >
                              <SelectTrigger className="w-full rounded-lg" aria-label="DM recipient">
                                <SelectValue placeholder="Pick a member…" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {humanMembers.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {step.type === 'run_agent' && (
                          <>
                            <div className="space-y-1.5">
                              <Label>Agent</Label>
                              <Select
                                value={step.config.agentId ?? ''}
                                onValueChange={(value) => patchStepConfig(index, { agentId: value })}
                              >
                                <SelectTrigger className="w-full rounded-lg" aria-label="Agent">
                                  <SelectValue placeholder="Pick an agent…" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                      @{agent.handle}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Reply in</Label>
                              <Select
                                value={step.config.channelId ?? TRIGGER_CHANNEL}
                                onValueChange={(value) =>
                                  patchStepConfig(index, {
                                    channelId: value === TRIGGER_CHANNEL ? undefined : value,
                                  })
                                }
                              >
                                <SelectTrigger className="w-full rounded-lg" aria-label="Reply channel">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value={TRIGGER_CHANNEL}>Where it was triggered</SelectItem>
                                  {namedChannels.map((channel) => (
                                    <SelectItem key={channel.id} value={channel.id}>
                                      #{channel.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}

                        {(step.type === 'post_message' || step.type === 'send_dm') && (
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`body-${step.id}`}>Message</Label>
                            <Textarea
                              id={`body-${step.id}`}
                              value={step.config.body ?? ''}
                              onChange={(event) => patchStepConfig(index, { body: event.target.value })}
                              placeholder="Ship it! Congrats on the deploy 🚀"
                              className="min-h-20 rounded-lg"
                            />
                            <div className="flex flex-wrap gap-1">
                              {TEMPLATE_VARS.map((variable) => (
                                <button
                                  key={variable}
                                  type="button"
                                  onClick={() => insertTemplate(index, variable)}
                                  className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-150 hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-400"
                                >
                                  {variable}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {step.type === 'add_reaction' && (
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`emoji-${step.id}`}>Emoji</Label>
                            <Input
                              id={`emoji-${step.id}`}
                              value={step.config.emoji ?? ''}
                              onChange={(event) => patchStepConfig(index, { emoji: event.target.value })}
                              placeholder="🎉"
                              className="w-24 rounded-lg"
                            />
                            <div className="flex flex-wrap gap-1 pt-1">
                              {EMOJI_QUICK_PICKS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  aria-label={`Use ${emoji}`}
                                  onClick={() => patchStepConfig(index, { emoji })}
                                  className="rounded-lg border border-border px-1.5 py-0.5 text-base leading-relaxed transition-colors duration-150 hover:border-emerald-500/50 hover:bg-emerald-500/5"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Reacts on the triggering message.
                            </p>
                          </div>
                        )}

                        {step.type === 'run_agent' && (
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`prompt-${step.id}`}>Prompt</Label>
                            <Textarea
                              id={`prompt-${step.id}`}
                              value={step.config.prompt ?? ''}
                              onChange={(event) => patchStepConfig(index, { prompt: event.target.value })}
                              placeholder="Post a single upbeat sentence celebrating the milestone…"
                              className="min-h-20 rounded-lg"
                            />
                            <div className="flex flex-wrap gap-1">
                              {TEMPLATE_VARS.map((variable) => (
                                <button
                                  key={variable}
                                  type="button"
                                  onClick={() => insertTemplate(index, variable)}
                                  className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-150 hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-400"
                                >
                                  {variable}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <Label htmlFor={`condition-${step.id}`} className="text-xs">
                          Condition{' '}
                          <span className="font-normal text-muted-foreground">
                            (only if the trigger message contains…)
                          </span>
                        </Label>
                        <Input
                          id={`condition-${step.id}`}
                          value={step.condition?.keyword ?? ''}
                          onChange={(event) =>
                            patchStep(index, {
                              condition: event.target.value
                                ? { keyword: event.target.value }
                                : undefined,
                            })
                          }
                          placeholder="optional, e.g. staging"
                          className="h-8 rounded-lg"
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border px-5 py-3.5 md:px-6">
          <Button variant="ghost" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || !form.name.trim()}
            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {busy ? 'Saving…' : workflow ? 'Save changes' : 'Create workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
