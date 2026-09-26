'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Hash, Lock, Plus, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { UserAvatar } from '../avatar'

export function CreateChannelDialog() {
  const open = useChatStore((s) => s.createChannelOpen)
  const setOpen = useChatStore((s) => s.setCreateChannelOpen)
  const users = useChatStore((s) => s.users)
  const me = useChatStore((s) => s.me)
  const createChannel = useChatStore((s) => s.createChannel)

  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [kind, setKind] = useState<'public' | 'private'>('public')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const filtered = useMemo(
    () =>
      users
        .filter((user) => user.id !== me?.id && user.kind === 'human')
        .filter(
          (user) =>
            !query ||
            user.name.toLowerCase().includes(query.toLowerCase()) ||
            (user.title ?? '').toLowerCase().includes(query.toLowerCase()),
        ),
    [users, me, query],
  )

  const submit = async () => {
    if (!slug || busy) return
    setBusy(true)
    try {
      await createChannel(slug, topic, kind, memberIds)
      toast.success(`Created ${kind === 'public' ? '#' : '🔒 private '}${slug}`)
      setName('')
      setTopic('')
      setMemberIds([])
      setQuery('')
      setKind('public')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create channel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(85vh/var(--ui-scale))] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" aria-hidden /> Create a channel
          </DialogTitle>
          <DialogDescription>
            Channels are where your team organizes conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <div className="flex items-center gap-1">
              <span className="text-lg text-muted-foreground">{kind === 'public' ? '#' : '🔒'}</span>
              <Input
                id="channel-name"
                autoFocus
                placeholder="e.g. launch-plan"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg"
              />
            </div>
            {slug && (
              <p className="text-xs text-muted-foreground">
                Preview: <span className="font-medium text-foreground">{slug}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-topic">
              Topic <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="channel-topic"
              placeholder="What is this channel about?"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['public', Hash, 'Public', 'Anyone in the workspace can join'],
                  ['private', Lock, 'Private', 'Only invited people can join'],
                ] as const
              ).map(([value, Icon, label, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  aria-pressed={kind === value}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-150',
                    kind === value
                      ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                      : 'border-border hover:border-border hover:bg-accent',
                  )}
                >
                  <Icon className={cn('h-4 w-4', kind === value ? 'text-emerald-600' : 'text-muted-foreground')} aria-hidden />
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Add members <span className="font-normal text-muted-foreground">({memberIds.length} selected)</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search people…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 rounded-lg pl-8 text-sm"
              />
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No people found</p>
              ) : (
                filtered.map((user) => (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-accent"
                  >
                    <Checkbox
                      checked={memberIds.includes(user.id)}
                      onCheckedChange={(checked) =>
                        setMemberIds((prev) =>
                          checked ? [...prev, user.id] : prev.filter((id) => id !== user.id),
                        )
                      }
                      className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                    />
                    <UserAvatar user={user} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{user.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{user.title}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-lg" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!slug || busy}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {busy ? 'Creating…' : 'Create channel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
