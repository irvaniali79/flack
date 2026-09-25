// Pure schedule-trigger helpers — safe to import from BOTH server (runtime,
// API routes) and client (workflow UI). No server-only imports allowed here.
import type { WorkflowTriggerConfig } from '@/lib/types'

/** Daily fire time, 24h "HH:MM" (group 1 = hours, group 2 = minutes). */
export const SCHEDULE_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

export const MIN_INTERVAL_MINUTES = 5
export const MAX_INTERVAL_MINUTES = 1440 // 24h

/** Preset interval choices offered in the builder (minutes). */
export const INTERVAL_PRESETS = [5, 10, 15, 30, 60, 120, 240] as const

/** Normalize just the schedule params (used for change detection). */
export function scheduleParamsOf(config: WorkflowTriggerConfig): {
  scheduleKind?: 'interval' | 'daily'
  minutes?: number
  time?: string
} {
  return {
    scheduleKind: config.scheduleKind,
    minutes: typeof config.minutes === 'number' ? config.minutes : undefined,
    time: typeof config.time === 'string' ? config.time : undefined,
  }
}

/** True when the schedule params (kind / minutes / time) differ between two configs. */
export function scheduleParamsChanged(
  a: WorkflowTriggerConfig,
  b: WorkflowTriggerConfig,
): boolean {
  const pa = scheduleParamsOf(a)
  const pb = scheduleParamsOf(b)
  return (
    pa.scheduleKind !== pb.scheduleKind || pa.minutes !== pb.minutes || pa.time !== pb.time
  )
}

/** Human sentence for a schedule config, e.g. "Every 15 minutes" / "Every day at 09:00". */
export function scheduleSentence(config: WorkflowTriggerConfig): string {
  if (config.scheduleKind === 'daily' && config.time) return `Every day at ${config.time}`
  if (config.scheduleKind === 'interval' && typeof config.minutes === 'number') {
    if (config.minutes === 60) return 'Every hour'
    if (config.minutes === MAX_INTERVAL_MINUTES) return 'Every day (rolling)'
    return `Every ${config.minutes} minutes`
  }
  return 'On a schedule'
}

/**
 * Compute the next fire time for a schedule config, strictly AFTER `from`
 * (server-local time for daily schedules). Returns null for invalid configs.
 */
export function computeNextRunAt(
  config: WorkflowTriggerConfig,
  from: Date = new Date(),
): Date | null {
  if (config.scheduleKind === 'interval') {
    const minutes = config.minutes
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < MIN_INTERVAL_MINUTES ||
      minutes > MAX_INTERVAL_MINUTES
    ) {
      return null
    }
    return new Date(from.getTime() + minutes * 60_000)
  }
  if (config.scheduleKind === 'daily') {
    const match = SCHEDULE_TIME_REGEX.exec(config.time ?? '')
    if (!match) return null
    const hours = Number(match[1])
    const mins = Number(match[2])
    const next = new Date(from)
    next.setHours(hours, mins, 0, 0)
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1)
    return next
  }
  return null
}

/** Parse nextRunAt into a valid Date, or null when absent/garbage. */
export function parseNextRunAt(config: WorkflowTriggerConfig): Date | null {
  if (!config.nextRunAt) return null
  const date = new Date(config.nextRunAt)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Semantic check for schedule triggers (zod already guards formats/ranges at
 * the API boundary): the kind must be set and its required param present.
 * Returns a human error message, or null when valid / not a schedule trigger.
 */
export function validateScheduleConfig(
  triggerType: string,
  config: WorkflowTriggerConfig,
): string | null {
  if (triggerType !== 'schedule') return null
  if (config.scheduleKind === 'interval') {
    return config.minutes === undefined ? 'Pick an interval (minutes) for the schedule' : null
  }
  if (config.scheduleKind === 'daily') {
    return config.time ? null : 'Pick a daily time (HH:MM) for the schedule'
  }
  return 'Choose “Every N minutes” or “Daily at a time” for the schedule'
}

