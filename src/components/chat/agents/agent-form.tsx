'use client'
// Create / edit form for AI agents — rendered inside the AgentDialog (view swap).
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AtSign, Hash, Lock, Search } from 'lucide-react'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import type { AgentDTO } from '@/lib/types'

export interface AgentWithMeta extends AgentDTO {
  messageCount: number
}

const HANDLE_PATTERN = /^[a-z0-9_-]{2,24}$/

const TOOL_OPTIONS = ['post_message', 'read_channel', 'search_messages', 'add_reaction'] as const

interface AgentFormProps {
  /** null = create a new agent */
  agent: AgentWithMeta | null
  onSaved: (agent: AgentWithMeta) => void
  onCancel: () => void
}

export function AgentForm({ agent, onSaved, onCancel }: AgentFormProps) {
  const channels = useChatStore((s) => s.channels)

  const [name, setName] = useState(agent?.user.name ?? '')
  const [handle, setHandle] = useState(agent?.handle ?? '')
  const [description, setDescription] = useState(agent?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [chatable, setChatable] = useState(agent?.chatable ?? true)
  const [model, setModel] = useState(agent?.model ?? 'glm-4')
  const [rateLimit, setRateLimit] = useState(String(agent?.rateLimitPerHour ?? 20))
  const [tools, setTools] = useState<string[]>(agent?.tools ?? [])
  const [scopeIds, setScopeIds] = useState<string[]>(agent?.scopeChannelIds ?? [])
  const [scopeQuery, setScopeQuery] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const scorableChannels = useMemo(
    () =>
      channels.filter(
        (c) => (c.kind === 'public' || c.kind === 'private') && !c.isArchived,
      ),
    [channels],
  )
  const filteredChannels = useMemo(
    () =>
      scorableChannels.filter((c) => !scopeQuery || c.name.toLowerCase().includes(scopeQuery.toLowerCase())),
    [scorableChannels, scopeQuery],
  )

  const handleValid = HANDLE_PATTERN.test(handle)

  const submit = async () => {
    const nextErrors: Record<string, string> = {}
    if (!name.trim()) nextErrors.name = 'Name is required'
    if (!handleValid) nextErrors.handle = '2–24 chars: lowercase letters, digits, - or _'
    if (systemPrompt.trim().length < 10) nextErrors.systemPrompt = 'Give the agent instructions (at least 10 characters)'
    const rate = Number(rateLimit)
    if (!Number.isInteger(rate) || rate < 1 || rate > 100) nextErrors.rateLimit = 'Rate limit must be 1–100'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        handle,
        description: description.trim() || null,
        systemPrompt: systemPrompt.trim(),
        chatable,
        model,
        rateLimitPerHour: rate,
        tools,
        scopeChannelIds: scopeIds,
      }
      const data = agent
        ? await api<{ agent: AgentWithMeta }>(`/api/agents/${agent.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await api<{ agent: AgentWithMeta }>('/api/agents', {
            method: 'POST',
            body: payload,
          })
      toast.success(agent ? `Updated @${data.agent.handle}` : `Created @${data.agent.handle}`)
      onSaved(data.agent)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the agent')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader className="space-y-1 text-left">
        <DialogTitle className="flex items-center gap-2 text-base">
          <AtSign className="h-4 w-4 text-emerald-600" aria-hidden />
          {agent ? `Edit @${agent.handle}` : 'New agent'}
        </DialogTitle>
        <DialogDescription>
          {agent
            ? 'Update the agent\u2019s persona, limits and scope.'
            : 'Agents answer when @mentioned (or in DMs) using their system prompt.'}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              autoFocus
              placeholder="e.g. QABot"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg"
            />
            {errors.name && <p className="text-xs text-rose-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-handle">Handle</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                id="agent-handle"
                placeholder="qa-bot"
                value={handle}
                onChange={(event) => setHandle(event.target.value.toLowerCase().trim())}
                className="rounded-lg font-mono text-sm"
              />
            </div>
            {handle && (
              <p className="text-xs text-muted-foreground">
                Mention as{' '}
                <span className={cn('font-medium', handleValid ? 'text-foreground' : 'text-rose-500')}>@{handle}</span>
              </p>
            )}
            {errors.handle && <p className="text-xs text-rose-500">{errors.handle}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="agent-description"
            placeholder="What does this agent do?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-prompt">System prompt</Label>
          <Textarea
            id="agent-prompt"
            placeholder="You are QABot… Check the team’s test plan, flag risky launches, and keep answers short."
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            className="min-h-32 rounded-lg font-mono text-[13px] leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            The agent&rsquo;s responsibility — how it should behave and reply. Recent channel
            conversation is provided automatically as context.
          </p>
          {errors.systemPrompt && <p className="text-xs text-rose-500">{errors.systemPrompt}</p>}
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="agent-chatable" className="text-sm">
                Chatable
              </Label>
              <p className="text-xs text-muted-foreground">Can be chatted with / mentioned</p>
            </div>
            <Switch
              id="agent-chatable"
              checked={chatable}
              onCheckedChange={setChatable}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full rounded-lg" aria-label="Model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="glm-4">glm-4</SelectItem>
                <SelectItem value="glm-4-air">glm-4-air</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Informational — powers replies.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-rate">Rate limit / hour</Label>
            <Input
              id="agent-rate"
              type="number"
              min={1}
              max={100}
              value={rateLimit}
              onChange={(event) => setRateLimit(event.target.value)}
              className="rounded-lg"
            />
            {errors.rateLimit && <p className="text-xs text-rose-500">{errors.rateLimit}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tools</Label>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_OPTIONS.map((tool) => {
              const active = tools.includes(tool)
              return (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setTools((prev) => (active ? prev.filter((t) => t !== tool) : [...prev, tool]))
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-150',
                    active
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {tool}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            Data scope{' '}
            <span className="font-normal text-muted-foreground">
              ({scopeIds.length === 0 ? 'all channels' : `${scopeIds.length} selected`})
            </span>
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search channels…"
              value={scopeQuery}
              onChange={(event) => setScopeQuery(event.target.value)}
              className="h-8 rounded-lg pl-8 text-sm"
            />
          </div>
          <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
            {filteredChannels.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No channels found</p>
            ) : (
              filteredChannels.map((channel) => (
                <label
                  key={channel.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-accent"
                >
                  <Checkbox
                    checked={scopeIds.includes(channel.id)}
                    onCheckedChange={(checked) =>
                      setScopeIds((prev) =>
                        checked ? [...prev, channel.id] : prev.filter((id) => id !== channel.id),
                      )
                    }
                    className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                  />
                  {channel.kind === 'private' ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Empty = all channels (DMs are always allowed).
          </p>
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="ghost" className="rounded-lg" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {busy ? 'Saving…' : agent ? 'Save changes' : 'Create agent'}
        </Button>
      </DialogFooter>
    </div>
  )
}
