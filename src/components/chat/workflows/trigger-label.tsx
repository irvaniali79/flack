// Shared helpers for humanizing workflow triggers in the UI.
import { MessageSquarePlus, Play, SmilePlus, Webhook } from 'lucide-react'
import type { ChannelDTO, WorkflowDTO } from '@/lib/types'

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
    default:
      return Play
  }
}
