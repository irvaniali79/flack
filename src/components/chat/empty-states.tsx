'use client'
import { Archive, Hash, Lock, MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/lib/store'

export function NoChannelSelected() {
  const channels = useChatStore((s) => s.channels)
  const openChannel = useChatStore((s) => s.openChannel)
  const general = channels.find((c) => c.slug === 'general') ?? channels[0]

  return (
    <div className="relative flex h-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden p-8 text-center">
      {/* soft emerald glow behind the icon (aria-hidden, purely decorative) */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-[62%] rounded-full opacity-[0.07] blur-3xl dark:opacity-[0.12]"
        style={{ background: 'radial-gradient(closest-side, oklch(0.696 0.17 162.48), transparent)' }}
        aria-hidden
      />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-gradient-to-b from-muted/60 to-muted/20 shadow-inner">
        <Hash className="h-9 w-9 text-muted-foreground/90" strokeWidth={2.2} aria-hidden />
      </div>
      <div className="relative">
        <h2 className="text-xl font-bold tracking-tight">Welcome to Acme Chat</h2>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-foreground/75 dark:text-zinc-400">
          Pick a channel or conversation on the left to get started.
        </p>
      </div>
      {general && (
        <Button
          variant="outline"
          className="group relative rounded-full border-border bg-background/80 px-5 font-semibold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-700 dark:hover:text-emerald-300"
          onClick={() => void openChannel(general.id)}
        >
          Jump to #{general.slug === 'general' ? 'general' : general.name}
          <MoveRight
            className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
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
