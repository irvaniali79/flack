'use client'
import { cn } from '@/lib/utils'

export function PresenceDot({
  online,
  className,
}: {
  online: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'block h-3 w-3 rounded-full border-2 border-background dark:border-zinc-950',
        online ? 'bg-emerald-500 presence-pulse' : 'bg-zinc-400 dark:bg-zinc-600',
        className,
      )}
      role="img"
      aria-label={online ? 'Online' : 'Offline'}
    />
  )
}
