'use client'
import { Archive, Hash, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/lib/store'

export function NoChannelSelected() {
  const channels = useChatStore((s) => s.channels)
  const openChannel = useChatStore((s) => s.openChannel)
  const general = channels.find((c) => c.slug === 'general') ?? channels[0]

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-muted/40">
        <Hash className="h-9 w-9 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h2 className="text-xl font-bold">Welcome to Acme Chat</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Pick a channel or conversation on the left to get started.
        </p>
      </div>
      {general && (
        <Button
          variant="secondary"
          className="rounded-full"
          onClick={() => void openChannel(general.id)}
        >
          Jump to #{general.slug === 'general' ? 'general' : general.name}
        </Button>
      )}
    </div>
  )
}

export function ArchivedChannel() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-muted/40">
        <Archive className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h3 className="font-semibold">This channel is archived</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You can browse the history, but nothing new can be posted.
        </p>
      </div>
    </div>
  )
}

export function EmptyThreadState() {
  return (
    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
      No replies yet — start the thread with a reply below.
    </p>
  )
}

export function ChannelIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === 'private') return <Lock className={className} aria-hidden />
  return <Hash className={className} aria-hidden />
}
