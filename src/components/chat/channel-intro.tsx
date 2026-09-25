'use client'
import { useEffect, useMemo, useState } from 'react'
import { Hash, Lock, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import type { ChannelDTO, MessageDTO, UserDTO } from '@/lib/types'
import { UserAvatar } from './avatar'

// ─── shared bits ─────────────────────────────────────────────────────────────

function BeginningDivider({ label = 'The beginning' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 pt-6" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full border border-border bg-muted/60 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Compact stand-in shown while older pages remain unloaded. */
export function CompactBeginning() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 md:px-6" aria-label="The beginning">
      <span className="h-px flex-1 bg-border/70" aria-hidden />
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        The beginning
      </span>
      <span className="h-px flex-1 bg-border/70" aria-hidden />
    </div>
  )
}

function IntroShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 pb-5 pt-8 md:px-6">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  )
}

// ─── channels ────────────────────────────────────────────────────────────────

function ChannelIntroBody({ channel, firstMessage }: { channel: ChannelDTO; firstMessage?: MessageDTO }) {
  const users = useChatStore((s) => s.users)
  const [creatorId, setCreatorId] = useState<string | null>(null)

  // Creator name comes from the channel detail GET (createdBy) — state is only
  // set from the async callback; the component is keyed by channel id upstream.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/channels/${channel.id}`)
      .then((res) => res.json())
      .then((data: { channel?: { createdBy?: string | null } }) => {
        if (!cancelled) setCreatorId(data.channel?.createdBy ?? null)
      })
      .catch(() => {
        if (!cancelled) setCreatorId(null)
      })
    return () => {
      cancelled = true
    }
  }, [channel.id])

  const creatorName = useMemo(
    () => users.find((u) => u.id === creatorId)?.name ?? null,
    [users, creatorId],
  )
  const createdOn = firstMessage
    ? format(parseISO(firstMessage.createdAt), 'MMMM d, yyyy')
    : null

  return (
    <IntroShell>
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/25 to-emerald-600/5 text-emerald-600 shadow-sm dark:from-emerald-400/20 dark:to-emerald-500/5 dark:text-emerald-400">
          {channel.kind === 'private' ? (
            <Lock className="h-7 w-7" aria-hidden />
          ) : (
            <Hash className="h-7 w-7" strokeWidth={2.4} aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-2xl font-bold leading-tight tracking-tight">
            {channel.kind === 'private' ? '' : '#'}
            {channel.name}
          </h2>
          {channel.topic && (
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {channel.topic}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {channel.memberCount} {channel.memberCount === 1 ? 'member' : 'members'}
            </span>
            {createdOn && <span>Created on {createdOn}</span>}
            {creatorName && <span>by {creatorName}</span>}
            {channel.isArchived && (
              <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                archived
              </span>
            )}
          </div>
        </div>
      </div>
      <BeginningDivider />
    </IntroShell>
  )
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

function dmStatus(user: UserDTO, online: boolean): string {
  if (user.kind === 'agent') return 'AI teammate — always on'
  if (user.statusEmoji || user.statusText) {
    return [user.statusEmoji, user.statusText].filter(Boolean).join(' ')
  }
  return online ? 'Active now' : 'Offline'
}

function DmIntro({ channel }: { channel: ChannelDTO }) {
  const presence = useChatStore((s) => s.presence)
  const other = channel.members?.[0] ?? null
  if (!other) return <GenericIntro name={channel.name} />

  const online = presence[other.id] || other.kind === 'agent'

  return (
    <IntroShell>
      <div className="flex items-start gap-4">
        <span className="relative shrink-0">
          <UserAvatar user={other} size="xxl" />
          {other.kind !== 'agent' && (
            <span className="absolute -bottom-0.5 -right-0.5">
              <span
                className={cn(
                  'block h-4 w-4 rounded-full border-[3px] border-background dark:border-zinc-900',
                  online ? 'bg-emerald-500 presence-pulse' : 'bg-zinc-400 dark:bg-zinc-600',
                )}
                role="img"
                aria-label={online ? 'Online' : 'Offline'}
              />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-2xl font-bold leading-tight tracking-tight">{other.name}</h2>
          {other.title && <p className="mt-0.5 text-sm font-medium text-muted-foreground">{other.title}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{dmStatus(other, online)}</p>
        </div>
      </div>
      <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
        This is the very beginning of your direct message history with{' '}
        <span className="font-semibold text-foreground/80">{other.name.split(' ')[0]}</span>. Only the two of
        you can see this conversation.
      </p>
      <BeginningDivider />
    </IntroShell>
  )
}

// ─── group DMs ───────────────────────────────────────────────────────────────

function GroupDmIntro({ channel }: { channel: ChannelDTO }) {
  const members = channel.members ?? []
  if (members.length === 0) return <GenericIntro name={channel.name} />
  const names = members.map((m) => m.name)

  return (
    <IntroShell>
      <div className="flex items-start gap-4">
        <span className="flex shrink-0 -space-x-3">
          {members.slice(0, 4).map((member) => (
            <UserAvatar key={member.id} user={member} size="lg" className="ring-2 ring-background" />
          ))}
          {members.length > 4 && (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground ring-2 ring-background">
              +{members.length - 4}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-2xl font-bold leading-tight tracking-tight">
            {names.slice(0, -1).join(', ')}
            {names.length > 1 && ' & '}
            {names[names.length - 1]}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {members.length + 1} members · group direct message
          </p>
        </div>
      </div>
      <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
        This is the beginning of your group conversation — messages here are visible only to its members.
      </p>
      <BeginningDivider />
    </IntroShell>
  )
}

// ─── fallback ────────────────────────────────────────────────────────────────

function GenericIntro({ name }: { name: string }) {
  return (
    <IntroShell>
      <h2 className="text-2xl font-bold leading-tight tracking-tight">{name}</h2>
      <BeginningDivider />
    </IntroShell>
  )
}

// ─── entry point ─────────────────────────────────────────────────────────────

export function ChannelIntro({ channel, firstMessage }: { channel: ChannelDTO; firstMessage?: MessageDTO }) {
  if (channel.kind === 'dm') return <DmIntro channel={channel} />
  if (channel.kind === 'group_dm') return <GroupDmIntro channel={channel} />
  return <ChannelIntroBody channel={channel} firstMessage={firstMessage} />
}
