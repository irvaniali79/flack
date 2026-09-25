// Shared DTO types used by API routes and the client. Keep in sync with
// the serializers in src/lib/serialize.ts.

export interface UserDTO {
  id: string
  name: string
  email?: string
  title: string | null
  avatarColor: string
  kind: 'human' | 'agent'
  role: 'owner' | 'admin' | 'member'
  statusEmoji: string | null
  statusText: string | null
  dndEnabled: boolean
  dndStart: string | null
  dndEnd: string | null
  /** Two-factor authentication armed (TOTP) */
  totpEnabled?: boolean
  /** off | digest — email preference for quiet-hour digests */
  emailNotif?: 'off' | 'digest'
  isActive: boolean
  handle?: string // agents only
  timezone?: string
}

export interface ReactionDTO {
  emoji: string
  users: { id: string; name: string }[]
  count: number
}

export interface FileDTO {
  id: string
  name: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
}

export interface MessageMentions {
  userIds: string[]
  specials: string[] // "@channel" | "@here"
}

export interface MessageDTO {
  id: string
  channelId: string
  sender: UserDTO | null
  body: string
  mentions: MessageMentions
  parentId: string | null
  replyCount: number
  isPinned: boolean
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  reactions: ReactionDTO[]
  files: FileDTO[]
}

export interface ChannelDTO {
  id: string
  name: string
  slug: string
  topic: string | null
  kind: 'public' | 'private' | 'dm' | 'group_dm'
  isArchived: boolean
  isDefault: boolean
  memberCount: number
  isMember: boolean
  unread: number
  mentionCount: number
  muted: boolean
  notifyLevel: 'all' | 'mentions' | 'none'
  // For DM/group-DM channels: the "other" members (excludes yourself)
  members?: UserDTO[]
  lastMessage?: { body: string; createdAt: string; senderName: string | null } | null
}

export interface AgentDTO {
  id: string
  userId: string
  handle: string
  description: string | null
  systemPrompt: string
  chatable: boolean
  isActive: boolean
  model: string
  rateLimitPerHour: number
  scopeChannelIds: string[]
  tools: string[]
  invocations: number
  user: UserDTO
}

export interface NotificationDTO {
  id: string
  type: string
  channelId: string | null
  channelName?: string | null
  messageId: string | null
  body: string
  actorName?: string | null
  readAt: string | null
  /** true while held back by quiet hours — delivered as a digest when the window ends */
  suppressed: boolean
  /** ISO instant while snoozed — hidden from the popover + badge until released */
  snoozedUntil?: string | null
  createdAt: string
}

// ─── Threads view ────────────────────────────────────────────────────────────

export interface ThreadCardDTO {
  /** thread root message id */
  rootId: string
  root: {
    id: string
    body: string
    createdAt: string
    senderName: string | null
    senderColor: string | null
    senderKind: 'human' | 'agent' | null
  }
  channel: {
    id: string
    name: string
    slug: string
    kind: 'public' | 'private' | 'dm' | 'group_dm'
  }
  replyCount: number
  /** up to 3 participant avatars + the total count */
  participants: { id: string; name: string; avatarColor: string; kind: 'human' | 'agent' }[]
  participantCount: number
  lastActivityAt: string
  unreadReplies: number
  following: boolean
}

// ─── Workflows ───────────────────────────────────────────────────────────────

export type WorkflowTriggerType =
  | 'button'
  | 'reaction'
  | 'message_posted'
  | 'webhook'
  | 'schedule'

export interface WorkflowTriggerConfig {
  channelId?: string
  emoji?: string
  keyword?: string
  // ── schedule triggers ──
  /** 'interval' = every N minutes · 'daily' = every day at HH:MM (server-local) */
  scheduleKind?: 'interval' | 'daily'
  /** interval cadence in minutes (5–1440), required when scheduleKind === 'interval' */
  minutes?: number
  /** daily fire time "HH:MM" 24h, required when scheduleKind === 'daily' */
  time?: string
  /** ISO timestamp of the next scheduled fire — managed server-side, stored in this JSON blob */
  nextRunAt?: string
}

export type WorkflowStepType =
  | 'post_message'
  | 'send_dm'
  | 'add_reaction'
  | 'run_agent'

export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  label?: string
  config: {
    channelId?: string
    body?: string
    userId?: string
    emoji?: string
    agentId?: string
    prompt?: string
    // Use the trigger message as target (for add_reaction)
    targetTriggerMessage?: boolean
  }
  // Optional condition: only run this step when the trigger message contains keyword
  condition?: { keyword?: string }
}

export interface WorkflowRunLog {
  step: string
  label?: string
  status: 'ok' | 'skipped' | 'failed'
  detail?: string
  at: string
}

export interface WorkflowDTO {
  id: string
  name: string
  description: string | null
  enabled: boolean
  triggerType: WorkflowTriggerType
  triggerConfig: WorkflowTriggerConfig
  steps: WorkflowStep[]
  runCount: number
  createdAt: string
  createdBy: string | null
}

export interface WorkflowRunDTO {
  id: string
  workflowId: string
  workflowName?: string
  status: 'running' | 'done' | 'failed'
  triggerLabel: string | null
  logs: WorkflowRunLog[]
  error: string | null
  startedAt: string
  finishedAt: string | null
}

// ─── API keys & MCP ──────────────────────────────────────────────────────────

export interface ApiKeyDTO {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
