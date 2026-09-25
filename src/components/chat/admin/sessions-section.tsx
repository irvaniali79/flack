'use client'
// Admin → Sessions tab: org-wide active session audit. Complements the
// per-user Security tab with the administrator's view — every member's
// signed-in devices in one list, stale-device detection, one-click revoke.
import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Loader2,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { UserAvatar } from '../avatar'

interface AdminSessionRow {
  id: string
  current: boolean
  device: string
  createdAt: string
  lastUsedAt: string
  expiresAt: string
}

interface AdminSessionUser {
  userId: string
  name: string
  email: string
  kind: string
  role: string
  avatarColor: string
  sessions: AdminSessionRow[]
}

interface AdminSessionsResponse {
  users: AdminSessionUser[]
  totals: { sessions: number; users: number; mine: number }
}

const STALE_AFTER_DAYS = 7

function isStale(row: AdminSessionRow): boolean {
  return Date.now() - parseISO(row.lastUsedAt).getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

function deviceIcon(device: string) {
  if (/iPhone|iPad|Android/.test(device)) return Smartphone
  if (/Tablet/.test(device)) return TabletSmartphone
  return Monitor
}

export function AdminSessionsSection() {
  const logout = useChatStore((s) => s.logout)
  const [data, setData] = useState<AdminSessionsResponse | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api<AdminSessionsResponse>('/api/admin/sessions')
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sessions')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (row: AdminSessionRow, userName: string) => {
    if (busyId) return
    setBusyId(row.id)
    try {
      const res = await api<{ ok: boolean; revokedOwn: boolean }>(`/api/admin/sessions/${row.id}`, {
        method: 'DELETE',
      })
      if (res.revokedOwn) {
        toast.success('Signed out — you revoked your own session')
        await logout()
        return
      }
      toast.success(`Revoked ${row.device}`, { description: `${userName} will need to sign in again on that device.` })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the session')
    } finally {
      setBusyId(null)
    }
  }

  const staleCount =
    data?.users.reduce(
      (n, u) => n + u.sessions.filter((s) => !s.current && isStale(s)).length,
      0,
    ) ?? 0

  return (
    <div className="space-y-4">
      {/* header card */}
      <div className="rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/5 via-card to-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Active sessions — org security audit</p>
            <p className="text-xs text-muted-foreground">
              Every signed-in device across the workspace. Revoke anything that looks forgotten or unfamiliar — the
              member simply signs in again.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 shrink-0 rounded-lg"
            onClick={() => void load()}
            disabled={!data}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" aria-hidden />
            Refresh
          </Button>
        </div>
        {data && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
              {data.totals.sessions} active session{data.totals.sessions === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {data.totals.users} member{data.totals.users === 1 ? '' : 's'} signed in
            </span>
            {staleCount > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {staleCount} idle {STALE_AFTER_DAYS}+ days
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {!data && !error ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data?.users.length === 0 && (
            <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No active sessions — everyone is signed out.
            </p>
          )}
          {data?.users.map((user) => {
            const stale = user.sessions.filter((s) => !s.current && isStale(s)).length
            return (
              <div key={user.userId} className="overflow-hidden rounded-xl border border-border">
                {/* user header */}
                <div className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
                  <UserAvatar
                    user={{ name: user.name, avatarColor: user.avatarColor, kind: user.kind as 'human' | 'agent' }}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                      <span className="truncate">{user.name}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {user.role}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                  </div>
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      stale > 0
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    )}
                  >
                    {user.sessions.length} session{user.sessions.length === 1 ? '' : 's'}
                    {stale > 0 && ` · ${stale} idle`}
                  </span>
                </div>
                {/* session rows */}
                <div className="divide-y divide-border">
                  {user.sessions.map((row) => {
                    const Icon = deviceIcon(row.device)
                    const staleRow = !row.current && isStale(row)
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-muted/30"
                      >
                        <div
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                            staleRow
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                            <span className="truncate">{row.device}</span>
                            {row.current && (
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                                THIS IS YOU
                              </span>
                            )}
                            {staleRow && (
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                                IDLE {formatDistanceToNow(parseISO(row.lastUsedAt), { addSuffix: false }).replace('about ', '')}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            active {formatDistanceToNow(parseISO(row.lastUsedAt), { addSuffix: true })} · signed in{' '}
                            {formatDistanceToNow(parseISO(row.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                          onClick={() => void revoke(row, user.name)}
                          disabled={busyId === row.id}
                          aria-label={`Revoke ${user.name}'s session on ${row.device}`}
                        >
                          {busyId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          ) : (
                            <LogOut className="h-3 w-3" aria-hidden />
                          )}
                          Revoke
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Sessions expire on their own after 30 days. This view shows tokens as device labels only — raw tokens are never
        exposed. Revocations are recorded in the audit log as{' '}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">admin.session_revoked</code>.
      </p>
    </div>
  )
}
