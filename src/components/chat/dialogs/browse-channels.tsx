'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Compass, Hash, Lock, Search, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'

export function BrowseChannelsDialog() {
  const open = useChatStore((s) => s.browseChannelsOpen)
  const setOpen = useChatStore((s) => s.setBrowseChannelsOpen)
  const channels = useChatStore((s) => s.channels)
  const joinChannel = useChatStore((s) => s.joinChannel)
  const openChannel = useChatStore((s) => s.openChannel)
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

  const publicChannels = useMemo(
    () =>
      channels
        .filter((c) => c.kind === 'public' && !c.isArchived)
        .filter(
          (c) =>
            !query ||
            c.name.toLowerCase().includes(query.toLowerCase()) ||
            (c.topic ?? '').toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [channels, query],
  )

  const myCount = channels.filter((c) => c.kind !== 'dm' && c.kind !== 'group_dm' && c.isMember).length
  const others = publicChannels.filter((c) => !c.isMember)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(80vh/var(--ui-scale))] overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-emerald-600" aria-hidden /> Browse channels
          </DialogTitle>
          <DialogDescription>
            You&rsquo;re in {myCount} {myCount === 1 ? 'channel' : 'channels'}
            {others.length > 0 ? ` — ${others.length} more to discover` : ' — you&rsquo;ve joined everything!'}
          </DialogDescription>
          <div className="relative pt-1">
            <Search className="absolute left-2.5 top-[calc(50%+2px)] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search channels…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 rounded-lg pl-8"
            />
          </div>
        </DialogHeader>

        <div className="max-h-[calc(60vh/var(--ui-scale))] space-y-0.5 overflow-y-auto p-2">
          {publicChannels.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Compass className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium">No channels found</p>
              <p className="text-xs text-muted-foreground">You&rsquo;re not a member of anything else.</p>
            </div>
          ) : (
            publicChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-accent"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {channel.kind === 'private' ? (
                    <Lock className="h-4 w-4" aria-hidden />
                  ) : (
                    <Hash className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold">
                    {channel.name}
                    {channel.isDefault && (
                      <span className="rounded bg-muted px-1.5 py-px text-[9px] font-bold uppercase text-muted-foreground">
                        default
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden />
                      {channel.memberCount}
                    </span>
                    {channel.topic && <span className="truncate">· {channel.topic}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={joining === channel.id}
                  onClick={() => {
                    if (channel.isMember) {
                      setOpen(false)
                      void openChannel(channel.id)
                    } else {
                      setJoining(channel.id)
                      void joinChannel(channel.id)
                        .then(() => {
                          toast.success(`Joined #${channel.name}`)
                          setOpen(false)
                        })
                        .catch((err: Error) => toast.error(err.message))
                        .finally(() => setJoining(null))
                    }
                  }}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150',
                    channel.isMember
                      ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-foreground text-background hover:opacity-90',
                  )}
                >
                  {joining === channel.id ? 'Joining…' : channel.isMember ? 'Open' : 'Join'}
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ChannelListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  )
}
