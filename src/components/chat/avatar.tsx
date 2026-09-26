'use client'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserDTO } from '@/lib/types'
import { PresenceDot } from './presence-dot'

// Profile pictures render as perfect circles everywhere (user request) —
// focus rings around them inherit the shape, so they're always round too.
const SIZES = {
  xs: 'h-6 w-6 text-[10px] rounded-full',
  sm: 'h-7 w-7 text-[11px] rounded-full',
  md: 'h-9 w-9 text-xs rounded-full',
  lg: 'h-11 w-11 text-sm rounded-full',
  xl: 'h-16 w-16 text-xl rounded-full',
  xxl: 'h-24 w-24 text-3xl rounded-full',
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
  user: Pick<UserDTO, 'name' | 'avatarColor' | 'kind'> & { avatarUrl?: string | null }
  size?: AvatarSize
  presence?: boolean
  online?: boolean
  className?: string
}) {
  // If the photo fails to load (deleted file, stale URL), fall back to initials.
  const [photoBroken, setPhotoBroken] = useState(false)
  const showPhoto = !!user.avatarUrl && !photoBroken

  return (
    // Wrapper is rounded-full so any ring/border placed on it (e.g. the
    // ring-4 behind the xxl profile avatar, ring-2 on stacked member avatars)
    // paints as a CIRCLE — the avatar inside is always a perfect circle too.
    <span className={cn('relative inline-flex shrink-0 rounded-full', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden font-semibold text-white select-none',
          SIZES[size],
        )}
        style={showPhoto ? undefined : { backgroundColor: user.avatarColor }}
        aria-hidden
      >
        {showPhoto ? (
          // runtime-uploaded image served by /api/files, not a build-time asset
          <img
            src={user.avatarUrl as string}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setPhotoBroken(true)}
          />
        ) : (
          initials(user.name)
        )}
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
