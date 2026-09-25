'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  Bot,
  ChevronLeft,
  Database,
  Hash,
  History,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UsersRound,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, formatBytes } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { formatRelativeTime } from '@/lib/time'
import type { UserDTO } from '@/lib/types'
import { SlackImportSection } from './slack-import-section'
import { CutoverSection } from './cutover-section'
import { CustomEmojiSection } from './custom-emoji-section'
import { UserAvatar } from '../avatar'
import { cn } from '@/lib/utils'

interface AdminStats {
  users: number
  activeUsers: number
  channels: number
  messagesToday: number
  agents: number
  workflows: number
  files: number
  storageBytes: number
  messagesPerDay: { date: string; count: number }[]
  topChannels: { name: string; kind: string; count: number }[]
  recentAudit: { action: string; target: string | null; actorName: string | null; at: string }[]
}

interface AdminUser extends UserDTO {
  messageCount: number
}

interface AdminChannel {
  id: string
  name: string
  slug: string
  topic: string | null
  kind: string
  isArchived: boolean
  memberCount: number
  messageCount: number
}

function auditActionColor(action: string): string {
  if (action.includes('deleted')) return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
  if (action.includes('created')) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (action.includes('updated')) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

export function AdminView() {
  const me = useChatStore((s) => s.me)
  const setView = useViewStore((s) => s.setView)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [members, setMembers] = useState<AdminUser[] | null>(null)
  const [channels, setChannels] = useState<AdminChannel[] | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [deletingChannel, setDeletingChannel] = useState<AdminChannel | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set())
  const [busyChannelIds, setBusyChannelIds] = useState<Set<string>>(new Set())

  const loadAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const [statsData, usersData, channelsData] = await Promise.all([
        api<AdminStats>('/api/admin/stats'),
        api<{ users: AdminUser[] }>('/api/admin/users'),
        api<{ channels: AdminChannel[] }>('/api/admin/channels'),
      ])
      setStats(statsData)
      setMembers(usersData.users)
      setChannels(channelsData.channels)
      setStatsError(null)
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Could not load admin data')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void loadAll()
  }, [isAdmin, loadAll])

  const filteredMembers = useMemo(() => {
    if (!members) return null
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        (user.email ?? '').toLowerCase().includes(q) ||
        (user.title ?? '').toLowerCase().includes(q),
    )
  }, [members, query])

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 text-muted-foreground">
          <Lock className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="text-lg font-bold">Admins only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This dashboard manages workspace members, channels and the audit log. Ask an owner or
          admin for access.
        </p>
        <Button variant="outline" className="rounded-lg" onClick={() => setView('chat')}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to chat
        </Button>
      </div>
    )
  }

  const withBusyUser = (userId: string, busy: boolean) =>
    setBusyUserIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(userId)
      else next.delete(userId)
      return next
    })

  const withBusyChannel = (channelId: string, busy: boolean) =>
    setBusyChannelIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(channelId)
      else next.delete(channelId)
      return next
    })

  const updateUser = async (
    user: AdminUser,
    patch: { role?: 'owner' | 'admin' | 'member'; isActive?: boolean },
  ) => {
    if (busyUserIds.has(user.id)) return
    withBusyUser(user.id, true)
    // optimistic
    setMembers((prev) =>
      prev ? prev.map((u) => (u.id === user.id ? { ...u, ...patch } : u)) : prev,
    )
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { userId: user.id, ...patch } })
      toast.success(`Updated ${user.name}`)
    } catch (err) {
      // revert
      setMembers((prev) =>
        prev ? prev.map((u) => (u.id === user.id ? { ...u, role: user.role, isActive: user.isActive } : u)) : prev,
      )
      toast.error(err instanceof Error ? err.message : 'Could not update member')
    } finally {
      withBusyUser(user.id, false)
    }
  }

  const updateChannel = async (channel: AdminChannel, isArchived: boolean) => {
    if (busyChannelIds.has(channel.id)) return
    withBusyChannel(channel.id, true)
    setChannels((prev) =>
      prev ? prev.map((c) => (c.id === channel.id ? { ...c, isArchived } : c)) : prev,
    )
    try {
      await api('/api/admin/channels', {
        method: 'PATCH',
        body: { channelId: channel.id, isArchived },
      })
      toast.success(`${isArchived ? 'Archived' : 'Unarchived'} #${channel.name}`)
    } catch (err) {
      setChannels((prev) =>
        prev ? prev.map((c) => (c.id === channel.id ? { ...c, isArchived: channel.isArchived } : c)) : prev,
      )
      toast.error(err instanceof Error ? err.message : 'Could not update channel')
    } finally {
      withBusyChannel(channel.id, false)
    }
  }

  const confirmDeleteChannel = async () => {
    if (!deletingChannel || busyDelete) return
    setBusyDelete(true)
    try {
      await api(`/api/admin/channels?channelId=${deletingChannel.id}`, { method: 'DELETE' })
      toast.success(`Deleted #${deletingChannel.name} and its messages`)
      setChannels((prev) => (prev ? prev.filter((c) => c.id !== deletingChannel.id) : prev))
      setDeletingChannel(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete channel')
    } finally {
      setBusyDelete(false)
    }
  }

  const statCards = stats
    ? [
        { icon: UsersRound, label: 'Users', value: `${stats.users}`, hint: `${stats.activeUsers} active`, tone: 'text-emerald-600 dark:text-emerald-400' },
        { icon: MessageSquare, label: 'Messages today', value: `${stats.messagesToday}`, hint: 'since midnight', tone: 'text-sky-600 dark:text-sky-400' },
        { icon: Hash, label: 'Channels', value: `${stats.channels}`, hint: 'public + private', tone: 'text-amber-600 dark:text-amber-400' },
        { icon: Bot, label: 'Agents', value: `${stats.agents}`, hint: 'AI teammates', tone: 'text-fuchsia-600 dark:text-fuchsia-400' },
        { icon: Zap, label: 'Workflows', value: `${stats.workflows}`, hint: 'automations', tone: 'text-rose-600 dark:text-rose-400' },
        { icon: Database, label: 'Storage', value: formatBytes(stats.storageBytes), hint: `${stats.files} files`, tone: 'text-teal-600 dark:text-teal-400' },
      ]
    : []

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('chat')}
          className="h-8 shrink-0 rounded-lg px-2 text-muted-foreground"
          aria-label="Back to chat"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Chat</span>
        </Button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
          <Shield className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">Admin dashboard</h1>
          <p className="truncate text-xs text-muted-foreground">
            Workspace health, members, channels and the audit trail.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadAll()}
          disabled={refreshing}
          className="rounded-lg"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Refresh
        </Button>
      </header>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {statsError ? (
          <div className="mx-auto max-w-md rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-600 dark:text-rose-400">
            {statsError}
            <div className="mt-3">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void loadAll()}>
                Retry
              </Button>
            </div>
          </div>
        ) : !stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-5">
            {/* stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {statCards.map(({ icon: Icon, label, value, hint, tone }) => (
                <div
                  key={label}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/30 hover:shadow-sm"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    aria-hidden
                  />
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} aria-hidden />
                    <span className="truncate text-xs font-medium">{label}</span>
                  </div>
                  <p className="mt-1.5 text-xl font-bold leading-none tabular-nums">{value}</p>
                  <p className="mt-1 truncate text-[11px] text-foreground/55 dark:text-zinc-400">{hint}</p>
                </div>
              ))}
            </div>

            {/* activity chart */}
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" aria-hidden />
                <h2 className="text-sm font-semibold">Message activity — last 14 days</h2>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.messagesPerDay} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminMessageFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--foreground)', opacity: 0.55 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                      dy={6}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'var(--foreground)', opacity: 0.55 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RechartsTooltip
                      cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                        boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
                      }}
                      labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Messages"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#adminMessageFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* tabs */}
            <Tabs defaultValue="members">
              <TabsList className="rounded-xl">
                <TabsTrigger value="members" className="rounded-lg">Members</TabsTrigger>
                <TabsTrigger value="channels" className="rounded-lg">Channels</TabsTrigger>
                <TabsTrigger value="import" className="rounded-lg">Import</TabsTrigger>
                <TabsTrigger value="cutover" className="rounded-lg">Cutover</TabsTrigger>
                <TabsTrigger value="emoji" className="rounded-lg">Emoji</TabsTrigger>
                <TabsTrigger value="audit" className="rounded-lg">Audit log</TabsTrigger>
              </TabsList>

              {/* members */}
              <TabsContent value="members" className="mt-4">
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border p-3">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search members by name, email or title…"
                      className="h-8 rounded-lg border-0 bg-muted/60 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                      aria-label="Search members"
                    />
                  </div>
                  {!filteredMembers ? (
                    <div className="space-y-2 p-3">
                      {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-11 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Member</TableHead>
                            <TableHead className="hidden sm:table-cell">Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Messages</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMembers.map((user) => {
                            const isSelf = user.id === me?.id
                            const busy = busyUserIds.has(user.id)
                            return (
                              <TableRow key={user.id} className={cn(busy && 'opacity-60')}>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <UserAvatar user={user} size="sm" />
                                    <div className="min-w-0">
                                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                        {user.name}
                                        {user.kind === 'agent' && (
                                          <Badge variant="outline" className="rounded px-1 text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                            bot
                                          </Badge>
                                        )}
                                        {isSelf && (
                                          <span className="text-[10px] text-muted-foreground">(you)</span>
                                        )}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {user.title ?? (user.handle ? `@${user.handle}` : '—')}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden max-w-48 truncate text-xs text-muted-foreground sm:table-cell">
                                  {user.email ?? '—'}
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={user.role}
                                    disabled={isSelf || busy}
                                    onValueChange={(role) =>
                                      void updateUser(user, { role: role as AdminUser['role'] })
                                    }
                                  >
                                    <SelectTrigger
                                      className="h-8 w-28 rounded-lg text-xs capitalize"
                                      aria-label={`Role for ${user.name}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      <SelectItem value="owner">Owner</SelectItem>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="member">Member</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={user.isActive}
                                      disabled={isSelf || busy}
                                      onCheckedChange={(isActive) => void updateUser(user, { isActive })}
                                      aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                                      className="data-[state=checked]:bg-emerald-600"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {user.isActive ? 'Active' : 'Disabled'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                  {user.messageCount}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                          {filteredMembers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                                No members match “{query}”.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* channels */}
              <TabsContent value="channels" className="mt-4">
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {!channels ? (
                    <div className="space-y-2 p-3">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-11 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Channel</TableHead>
                            <TableHead>Members</TableHead>
                            <TableHead className="text-right">Messages</TableHead>
                            <TableHead>Archived</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {channels.map((channel) => {
                            const busy = busyChannelIds.has(channel.id)
                            return (
                              <TableRow key={channel.id} className={cn(busy && 'opacity-60')}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'rounded px-1.5 text-[10px] uppercase tracking-wide',
                                        channel.kind === 'private'
                                          ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                                          : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
                                      )}
                                    >
                                      {channel.kind}
                                    </Badge>
                                    <span className="truncate text-sm font-medium">
                                      #{channel.name}
                                    </span>
                                    {channel.isArchived && (
                                      <Badge variant="secondary" className="rounded text-[10px]">
                                        archived
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm tabular-nums text-muted-foreground">
                                  {channel.memberCount}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                  {channel.messageCount}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={channel.isArchived}
                                    disabled={busy}
                                    onCheckedChange={(isArchived) => void updateChannel(channel, isArchived)}
                                    aria-label={`${channel.isArchived ? 'Unarchive' : 'Archive'} #${channel.name}`}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Delete #${channel.name}`}
                                    title="Delete channel"
                                    onClick={() => setDeletingChannel(channel)}
                                    className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-600/10 hover:text-rose-600 dark:hover:text-rose-400"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Slack import */}
              <TabsContent value="import" className="mt-4">
                <SlackImportSection />
              </TabsContent>

              {/* Cutover validation (migration phase 3) */}
              <TabsContent value="cutover" className="mt-4">
                <CutoverSection />
              </TabsContent>

              {/* Custom emoji management */}
              <TabsContent value="emoji" className="mt-4">
                <CustomEmojiSection />
              </TabsContent>

              {/* audit log */}
              <TabsContent value="audit" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Latest {stats.recentAudit.length} workspace events
                  </div>
                  {stats.recentAudit.length === 0 ? (
                    <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                      Nothing logged yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {stats.recentAudit.map((entry, index) => (
                        <li key={`${entry.at}-${index}`} className="flex flex-wrap items-center gap-2 px-1 py-2.5">
                          <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatRelativeTime(entry.at)}
                          </span>
                          <span className="text-sm font-medium">{entry.actorName ?? 'System'}</span>
                          <Badge
                            variant="secondary"
                            className={cn('rounded-full text-[10px] font-semibold', auditActionColor(entry.action))}
                          >
                            {entry.action}
                          </Badge>
                          {entry.target && (
                            <span className="truncate text-xs text-muted-foreground">{entry.target}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* channel delete confirm */}
      <AlertDialog open={!!deletingChannel} onOpenChange={(open) => !open && setDeletingChannel(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete #{deletingChannel?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the channel and all{' '}
              {deletingChannel?.messageCount ?? 0} messages in it, including threads. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDeleteChannel()}
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
            >
              {busyDelete ? 'Deleting…' : 'Delete channel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
