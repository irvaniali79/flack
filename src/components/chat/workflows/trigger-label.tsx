// Shared helpers for humanizing workflow triggers in the UI.
import { formatDistanceToNow, parseISO } from 'date-fns'
import { CalendarClock, MessageSquarePlus, Play, SmilePlus, Webhook } from 'lucide-react'
import type { ChannelDTO, WorkflowDTO, WorkflowTriggerConfig } from '@/lib/types'
import { scheduleSentence } from '@/lib/workflows/schedule'

export function humanizeTrigger(
  triggerType: WorkflowDTO['triggerType'],
  triggerConfig: WorkflowDTO['triggerConfig'],
  channels: ChannelDTO[],
): string {
  const config = triggerConfig ?? {}
  const channel = channels.find((c) => c.id === config.channelId)
  switch (triggerType) {
    case 'button':
      return 'When someone clicks Run now'
    case 'reaction':
      return config.emoji
        ? `When a ${config.emoji} reaction is added`
        : 'When any reaction is added'
    case 'message_posted': {
      const where = channel ? ` in #${channel.name}` : ' in any channel'
      const keyword = config.keyword ? ` containing “${config.keyword}”` : ''
      return `When a message${keyword} is posted${where}`
    }
    case 'webhook':
      return 'When an external webhook is received'
    case 'schedule':
      return `When the schedule fires — ${scheduleSentence(config)}`
    default:
      return 'Manual workflow'
  }
}

export function triggerIconFor(type: WorkflowDTO['triggerType']) {
  switch (type) {
    case 'button':
      return Play
    case 'reaction':
      return SmilePlus
    case 'message_posted':
      return MessageSquarePlus
    case 'webhook':
      return Webhook
    case 'schedule':
      return CalendarClock
    default:
      return Play
  }
}

/**
 * Relative label for a schedule workflow's next fire time
 * ("in 5 minutes", "due momentarily" when the tick is imminent).
 * Returns null when there is nothing useful to show.
 */
export function nextRunLabel(
  triggerType: WorkflowDTO['triggerType'],
  config: WorkflowTriggerConfig | undefined,
  enabled: boolean,
): string | null {
  if (triggerType !== 'schedule' || !enabled || !config?.nextRunAt) return null
  const date = parseISO(config.nextRunAt)
  if (Number.isNaN(date.getTime())) return null
  const ms = date.getTime() - Date.now()
  if (ms <= 0) return 'due momentarily'
  if (ms < 45_000) return 'in less than a minute'
  return formatDistanceToNow(date, { addSuffix: true })
}
