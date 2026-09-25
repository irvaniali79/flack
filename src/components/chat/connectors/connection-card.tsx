'use client'
// One card per active connection in "Your connections" — shows the install
// (connector, account, destination channel, subscriber count) plus:
//   · Send a test event (any member)
//   · Manage (admins): event-subscription switches, destination channel
//     select, and a confirmed disconnect
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  Hash,
  Loader2,
  Lock,
  PlugZap,
  Settings2,
  Unplug,
} from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import { useViewStore } from '@/lib/view-store'
import { formatRelativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { ConnectorConnectionDTO, ConnectorDefDTO } from '@/lib/types'
import { ConnectorTile } from './connector-icon'

export function ConnectionCard({
  connection,
  def,
  canManage,
  onChanged,
}: {
  connection: ConnectorConnectionDTO
  def: ConnectorDefDTO
  canManage: boolean
  onChanged: () => void
}) {
  const channels = useChatStore((s) => s.channels)
  const openChannel = useChatStore((s) => s.openChannel)
  const setView = useViewStore((s) => s.setView)

  const [expanded, setExpanded] = useState(false)
  const [subs, setSubs] = useState<Record<string, boolean>>(connection.eventSubs)
  const [channelId, setChannelId] = useState(connection.channel.id)
  const [busyEvent, setBusyEvent] = useState(false)
  const [busyToggle, setBusyToggle] = useState<string | null>(null)
  const [busyChannel, setBusyChannel] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [busyDisconnect, setBusyDisconnect] = useState(false)

  // Re-sync local editable state if a refetch swaps the connection object
  useEffect(() => {
    setSubs(connection.eventSubs)
    setChannelId(connection.channel.id)
  }, [connection.id, connection.eventSubs, connection.channel.id])

  const onCount = def.events.filter((e) => subs[e.id]).length
  const channelName = channels.find((c) => c.id === channelId)?.name ?? connection.channel.name
  const postable = channels.filter((c) => c.kind === 'public' || c.kind === 'private')

  const goToChannel = (id: string) => {
    setView('chat')
    void openChannel(id)
  }

  const sendTestEvent = async () => {
    if (busyEvent) return
    setBusyEvent(true)
    try {
      const data = await api<{ event: { title: string } }>(
        `/api/connectors/${connection.id}/events`,
        { method: 'POST', body: {} },
      )
      toast.success(`Event posted to #${channelName}`, {
        description: data.event.title,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the test event')
    } finally {
      setBusyEvent(false)
    }
  }

  const toggleEvent = async (eventId: string, next: boolean) => {
    if (busyToggle) return
    const prev = subs
    const optimistic = { ...subs, [eventId]: next }
    setSubs(optimistic)
    setBusyToggle(eventId)
    try {
      await api(`/api/connectors/${connection.id}`, {
        method: 'PATCH',
        body: { eventIds: def.events.filter((e) => optimistic[e.id]).map((e) => e.id) },
      })
      onChanged()
    } catch (err) {
      setSubs(prev)
      toast.error(err instanceof Error ? err.message : 'Could not update subscriptions')
    } finally {
      setBusyToggle(null)
    }
  }

  const changeChannel = async (nextId: string) => {
    if (busyChannel || nextId === channelId) return
    const prev = channelId
    setChannelId(nextId)
    setBusyChannel(true)
    try {
      await api(`/api/connectors/${connection.id}`, {
        method: 'PATCH',
        body: { channelId: nextId },
      })
      toast.success(`${def.name} now posts to #${channels.find((c) => c.id === nextId)?.name ?? 'the channel'}`)
      onChanged()
    } catch (err) {
      setChannelId(prev)
      toast.error(err instanceof Error ? err.message : 'Could not move the connector')
    } finally {
      setBusyChannel(false)
    }
  }

  const disconnect = async () => {
    if (busyDisconnect) return
    setBusyDisconnect(true)
    try {
      await api(`/api/connectors/${connection.id}`, { method: 'DELETE' })
      toast.success(`Disconnected ${def.name}`)
      setConfirmDisconnect(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setBusyDisconnect(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-border hover:shadow-sm">
      {/* main row */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <ConnectorTile icon={def.icon} color={def.color} size="lg" />

        <div className="min-w-[9rem] flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-bold leading-none">{def.name}</h3>
            <code className="max-w-full shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title={connection.accountLabel}>
              {connection.accountLabel}
            </code>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => goToChannel(connection.channel.id)}
              title={`Open #${connection.channel.name}`}
              className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 font-medium text-foreground/80 transition-colors duration-150 hover:bg-accent"
            >
              {connection.channel.kind === 'private' ? (
                <Lock className="h-3 w-3" aria-hidden />
              ) : (
                <Hash className="h-3 w-3" aria-hidden />
              )}
              {connection.channel.name}
            </button>
            <span className="inline-flex items-center gap-1">
              <PlugZap className="h-3 w-3 shrink-0" aria-hidden />
              {connection.connectedBy ? `connected by ${connection.connectedBy}` : 'connected'}{' '}
              · {formatRelativeTime(connection.createdAt)}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
              {onCount} event{onCount === 1 ? '' : 's'} subscribed
            </span>
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void sendTestEvent()}
            disabled={busyEvent}
            className="h-8 rounded-lg text-xs"
          >
            {busyEvent ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <PlugZap className="h-3.5 w-3.5" aria-hidden />
            )}
            Send test event
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="h-8 rounded-lg text-xs"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Manage</span>
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')}
                aria-hidden
              />
            </Button>
          )}
        </div>
      </div>

      {/* manage panel */}
      {canManage && expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Post to channel
            </p>
            <Select
              value={channelId}
              onValueChange={(next) => void changeChannel(next)}
              disabled={busyChannel}
            >
              <SelectTrigger className="w-full rounded-lg sm:w-64" aria-label="Destination channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {postable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-1.5">
                      {c.kind === 'private' ? (
                        <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                      ) : (
                        <Hash className="h-3 w-3 text-muted-foreground" aria-hidden />
                      )}
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Event subscriptions
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {def.events.map((event) => (
                <label
                  key={event.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-100 hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{event.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {event.description}
                    </span>
                  </span>
                  <Switch
                    checked={!!subs[event.id]}
                    onCheckedChange={(checked) => void toggleEvent(event.id, checked)}
                    disabled={busyToggle === event.id}
                    aria-label={event.label}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 px-3 py-2.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Disconnecting removes {def.name} from{' '}
              <span className="font-semibold text-foreground">#{channelName}</span> — history
              stays, but no new events post.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
              className="h-8 shrink-0 rounded-lg border-rose-500/40 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-400"
            >
              <Unplug className="h-3.5 w-3.5" aria-hidden />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {def.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The app leaves #{channelName} and stops posting{' '}
              {connection.accountLabel} events. Existing messages stay. You can reconnect anytime
              from the App directory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-500"
              onClick={(e) => {
                e.preventDefault() // keep the dialog open until the request settles
                void disconnect()
              }}
            >
              {busyDisconnect ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
