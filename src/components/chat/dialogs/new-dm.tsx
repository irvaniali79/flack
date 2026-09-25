'use client'
import { useMemo, useState } from 'react'
import { MessageSquarePlus, Search, Sparkles, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { UserAvatar } from '../avatar'
import { PresenceDot } from '../presence-dot'

export function NewDmDialog() {
  const open = useChatStore((s) => s.newDmOpen)
  const setOpen = useChatStore((s) => s.setNewDmOpen)
  const users = useChatStore((s) => s.users)
  const me = useChatStore((s) => s.me)
  const presence = useChatStore((s) => s.presence)
  const channels = useChatStore((s) => s.channels)
  const createDm = useChatStore((s) => s.createDm)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const candidates = useMemo(
    () =>
      users
        .filter((user) => user.id !== me?.id)
        .filter(
          (user) =>
            !query ||
            user.name.toLowerCase().includes(query.toLowerCase()) ||
            (user.handle ?? '').toLowerCase().includes(query.toLowerCase()) ||
            (user.title ?? '').toLowerCase().includes(query.toLowerCase()),
        ),
    [users, me, query],
  )

  const toggle = (userId: string) => {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : prev.length >= 8 ? prev : [...prev, userId],
    )
  }

  const start = async () => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    try {
      await createDm(selected)
      setSelected([])
      setQuery('')
      setOpen(false)
    } catch {
      // toast handled by caller path
    } finally {
      setBusy(false)
    }
  }

  const selectedUsers = selected
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-emerald-600" aria-hidden /> New conversation
          </DialogTitle>
          <DialogDescription>
            Pick one person for a DM, or up to 8 for a group conversation.
          </DialogDescription>
          <div className="relative pt-1">
            <Search className="absolute left-2.5 top-[calc(50%+2px)] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              placeholder="Search people…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 rounded-lg pl-8"
            />
          </div>
        </DialogHeader>

        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
            {selectedUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggle(user.id)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 py-1 pl-1 pr-2 text-xs font-medium text-emerald-700 transition-colors duration-150 hover:bg-emerald-500/20 dark:text-emerald-300"
                aria-label={`Remove ${user.name}`}
              >
                <UserAvatar user={user} size="xs" />
                {user.name.split(' ')[0]}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto p-2">
          {candidates.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No people found</p>
          ) : (
            candidates.map((user) => {
              const isSelected = selected.includes(user.id)
              // find existing dm with this user
              const existingDm = channels.find(
                (c) => c.kind === 'dm' && c.members?.length === 1 && c.members[0].id === user.id,
              )
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-accent',
                    isSelected && 'bg-emerald-500/10 hover:bg-emerald-500/15',
                  )}
                >
                  <span className="relative">
                    <UserAvatar user={user} size="md" presence online={presence[user.id] || user.kind === 'agent'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{user.name}</span>
                      {user.kind === 'agent' && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                          <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.title ?? (user.handle ? `@${user.handle}` : '')}
                      {existingDm ? ' · existing conversation' : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
                      isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border',
                    )}
                    aria-hidden
                  >
                    {isSelected && '✓'}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button
            disabled={selected.length === 0 || busy}
            onClick={() => void start()}
            className="w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          >
            {busy ? 'Opening…' : selected.length > 1 ? `Start group (${selected.length})` : 'Start conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
