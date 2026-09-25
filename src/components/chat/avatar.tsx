'use client'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserDTO } from '@/lib/types'
import { PresenceDot } from './presence-dot'

const SIZES = {
  xs: 'h-6 w-6 text-[10px] rounded-md',
  sm: 'h-7 w-7 text-[11px] rounded-md',
  md: 'h-9 w-9 text-xs rounded-lg',
  lg: 'h-11 w-11 text-sm rounded-xl',
  xl: 'h-16 w-16 text-xl rounded-2xl',
  xxl: 'h-24 w-24 text-3xl rounded-3xl',
} as const

export type AvatarSize = keyof typeof SIZES

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function UserAvatar({
  user,
  size = 'md',
  presence = false,
  online = false,
  className,
}: {
  user: Pick<UserDTO, 'name' | 'avatarColor' | 'kind'>
  size?: AvatarSize
  presence?: boolean
  online?: boolean
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center font-semibold text-white select-none',
          SIZES[size],
        )}
        style={{ backgroundColor: user.avatarColor }}
        aria-hidden
      >
        {initials(user.name)}
      </span>
      {user.kind === 'agent' && (
        <span
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-zinc-900 dark:bg-zinc-800"
          title="AI agent"
        >
          <Sparkles className="h-2.5 w-2.5 text-amber-400" />
        </span>
      )}
      {presence && !online && user.kind !== 'agent' && (
        <PresenceDot online={false} className="absolute -bottom-0.5 -right-0.5" />
      )}
      {presence && online && <PresenceDot online className="absolute -bottom-0.5 -right-0.5" />}
    </span>
  )
}
