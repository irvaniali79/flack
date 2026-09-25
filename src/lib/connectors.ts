// ─── Connector catalog (Slack-style App Directory) ───────────────────────────
// A connector is an external service (Google Calendar, GitHub, …) installed
// into the workspace. Each install ("connection") links an account label to a
// destination channel and posts its events there as a bot "app" user
// (User.kind = 'app'), exactly like Slack app messages.
//
// This module is server-safe (no React). Icons are referenced by key — the
// client maps them to lucide components in the Connectors view.
import { db } from '@/lib/db'
import { emitToChannel } from '@/lib/realtime-server'
import { serializeMessage } from '@/lib/serialize'
import type { ConnectorConnection, User } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectorEventDef {
  id: string
  label: string
  description: string
  defaultOn: boolean
}

export interface ConnectorDef {
  id: string
  name: string
  tagline: string
  description: string
  category: string
  /** icon key resolved by the client icon map */
  icon: string
  /** brand hex used for the app tile */
  color: string
  /** demo OAuth scope labels shown in the connect flow */
  scopes: string[]
  /** realistic demo account labels for the connect flow */
  sampleAccounts: string[]
  events: ConnectorEventDef[]
}

/** A concrete event instance — the content of one app message */
export interface ConnectorEventInstance {
  eventId: string
  title: string
  /** plain-text version (searchable, notifications, sidebar previews) */
  body: string
  fields?: { label: string; value: string }[]
  actions?: { label: string; style: 'primary' | 'default' }[]
  footer?: string
}

/** Realistic sample events per connector — the simulator picks from these */
export const CONNECTOR_SAMPLES: Record<string, ConnectorEventInstance[]> = {
  'google-calendar': [
    {
      eventId: 'meeting_reminder',
      title: 'Design sync — starts in 15 minutes',
      body: 'Design sync starts in 15 minutes (Standup room + Meet link). Organized by Sarah Chen.',
      fields: [
        { label: 'When', value: 'Today · 3:00 PM – 3:30 PM (Asia/Tehran)' },
        { label: 'Where', value: 'meet.google.com/abc-defg-hij' },
        { label: 'Organizer', value: 'Sarah Chen' },
      ],
      actions: [
        { label: 'Join meeting', style: 'primary' },
        { label: 'Respond', style: 'default' },
      ],
    },
    {
      eventId: 'event_created',
      title: 'New event: Q4 roadmap review',
      body: 'Sarah Chen scheduled “Q4 roadmap review” for Friday 10:00 AM, invited 6 people.',
      fields: [
        { label: 'When', value: 'Friday · 10:00 AM – 11:00 AM' },
        { label: 'Guests', value: 'Sarah, Marcus, Priya, Diego, Emma, Tom' },
      ],
      actions: [{ label: 'See details', style: 'default' }],
    },
    {
      eventId: 'event_updated',
      title: 'Sprint planning moved to 2:30 PM',
      body: 'Sprint planning was rescheduled from 2:00 PM to 2:30 PM today (same room).',
      fields: [
        { label: 'New time', value: 'Today · 2:30 PM – 3:15 PM' },
        { label: 'Updated by', value: 'Priya Patel' },
      ],
    },
  ],
  'google-drive': [
    {
      eventId: 'file_shared',
      title: 'Priya Patel shared “Q4 Brand Refresh.fig”',
      body: 'Priya Patel shared the file “Q4 Brand Refresh.fig” with the Design team — you can comment.',
      fields: [
        { label: 'Type', value: 'Figma design · 18.4 MB' },
        { label: 'Shared with', value: 'Design team (6 people)' },
      ],
      actions: [
        { label: 'Open in Drive', style: 'primary' },
        { label: 'Comment', style: 'default' },
      ],
    },
    {
      eventId: 'comment_added',
      title: 'New comment on “Launch checklists”',
      body: 'Emma Wilson commented on “Launch checklists.docx”: “Can we fold the release notes into page 2?”',
      fields: [
        { label: 'File', value: 'Launch checklists.docx' },
        { label: 'Comment', value: '“Can we fold the release notes into page 2?”' },
      ],
      actions: [{ label: 'Reply in file', style: 'default' }],
    },
    {
      eventId: 'file_updated',
      title: '“Acme brand guidelines v3.pdf” updated',
      body: 'Sarah Chen uploaded a new version of “Acme brand guidelines v3.pdf” (v3, 4.1 MB).',
      fields: [
        { label: 'Change', value: 'New version uploaded' },
        { label: 'Size', value: '4.1 MB' },
      ],
    },
  ],
  github: [
    {
      eventId: 'pr_opened',
      title: 'PR #482 opened: Fix thread pagination jump on fast scroll',
      body: 'Marcus Reid opened pull request #482 “Fix thread pagination jump on fast scroll” (main ← fix/thread-scroll).',
      fields: [
        { label: 'Branch', value: 'fix/thread-scroll → main' },
        { label: 'Reviews', value: '1 reviewer requested (Priya)' },
        { label: 'Checks', value: 'CI running · 12 files changed' },
      ],
      actions: [
        { label: 'Review PR', style: 'primary' },
        { label: 'Approve', style: 'default' },
      ],
    },
    {
      eventId: 'push',
      title: 'New push to main',
      body: 'priya-patel pushed 3 commits to main: “release: v0.9.4 staging cut”.',
      fields: [
        { label: 'Commits', value: '3 (release: v0.9.4 staging cut, chore: bump deps, fix: emoji cache)' },
        { label: 'By', value: 'priya-patel' },
      ],
    },
    {
      eventId: 'ci_failed',
      title: 'CI failed on main',
      body: 'Workflow “CI” failed on main at commit a1f3c9d — 2 tests failing in threads.spec.ts.',
      fields: [
        { label: 'Workflow', value: 'CI · run #1841' },
        { label: 'Failing', value: 'threads.spec.ts (2 tests)' },
      ],
      actions: [{ label: 'View run', style: 'primary' }],
    },
    {
      eventId: 'review_requested',
      title: 'Review requested: PR #479 “Slack import hardening”',
      body: 'Diego Alvarez requested your review on PR #479 “Slack import hardening”.',
      fields: [
        { label: 'Repository', value: 'acme/chat-platform' },
        { label: 'Size', value: '+412 −96 across 9 files' },
      ],
      actions: [{ label: 'Start review', style: 'primary' }],
    },
  ],
  zoom: [
    {
      eventId: 'meeting_started',
      title: 'Zoom meeting started: Weekly standup',
      body: 'Sarah Chen started the meeting “Weekly standup” — join while it’s running.',
      fields: [
        { label: 'Meeting ID', value: '842 115 9931' },
        { label: 'Started by', value: 'Sarah Chen' },
      ],
      actions: [{ label: 'Join meeting', style: 'primary' }],
    },
    {
      eventId: 'recording_ready',
      title: 'Cloud recording ready: Design critique',
      body: 'The cloud recording for “Design critique” (48 min) is ready to share.',
      fields: [
        { label: 'Duration', value: '48 minutes' },
        { label: 'Includes', value: 'Audio · Video · Transcript' },
      ],
      actions: [
        { label: 'Watch recording', style: 'primary' },
        { label: 'Copy share link', style: 'default' },
      ],
    },
  ],
  trello: [
    {
      eventId: 'card_moved',
      title: 'Card moved: “Dark mode polish” → Done',
      body: 'Emma Wilson moved “Dark mode polish” from In review to Done on the Design board.',
      fields: [
        { label: 'Board', value: 'Design' },
        { label: 'List', value: 'In review → Done' },
      ],
    },
    {
      eventId: 'card_assigned',
      title: 'You were assigned “Empty states copy”',
      body: 'Sarah Chen assigned you the card “Empty states copy” (due Friday) on the Design board.',
      fields: [
        { label: 'Due', value: 'Friday · 5:00 PM' },
        { label: 'Board', value: 'Design' },
      ],
      actions: [{ label: 'Open card', style: 'default' }],
    },
    {
      eventId: 'due_soon',
      title: 'Due soon: “Q4 illustration set”',
      body: 'The card “Q4 illustration set” is due tomorrow on the Design board.',
      fields: [{ label: 'Due', value: 'Tomorrow · 12:00 PM' }],
    },
  ],
  asana: [
    {
      eventId: 'task_assigned',
      title: 'Task assigned: “Draft Q4 launch announcement”',
      body: 'Sarah Chen assigned you the task “Draft Q4 launch announcement” in the Launch project.',
      fields: [
        { label: 'Project', value: 'Launch' },
        { label: 'Due', value: 'Thursday · 6:00 PM' },
      ],
      actions: [{ label: 'Open task', style: 'default' }],
    },
    {
      eventId: 'task_completed',
      title: '“Set up error tracking” completed',
      body: 'Tom Nguyen completed the task “Set up error tracking” in the Launch project. 🎉',
      fields: [
        { label: 'Project', value: 'Launch' },
        { label: 'Completed by', value: 'Tom Nguyen' },
      ],
    },
  ],
  jira: [
    {
      eventId: 'issue_created',
      title: 'ACME-291 created: Notifications badge off by one',
      body: 'Marcus Reid created ACME-291 “Notifications badge off by one” (Bug · Medium · Backlog).',
      fields: [
        { label: 'Type', value: 'Bug · Medium priority' },
        { label: 'Assignee', value: 'Unassigned' },
      ],
      actions: [{ label: 'Open issue', style: 'default' }],
    },
    {
      eventId: 'status_changed',
      title: 'ACME-288 moved to In Progress',
      body: 'Priya Patel moved ACME-288 “Thread follow toggles” from Selected to In Progress.',
      fields: [
        { label: 'Sprint', value: 'Sprint 14' },
        { label: 'Status', value: 'Selected → In Progress' },
      ],
    },
    {
      eventId: 'sprint_started',
      title: 'Sprint 14 started',
      body: 'Sprint 14 started with 21 issues (3 stories, 15 tasks, 3 bugs) — ends in two weeks.',
      fields: [
        { label: 'Goal', value: 'Ship file previews + polish notifications' },
        { label: 'Issues', value: '21 committed' },
      ],
    },
  ],
  salesforce: [
    {
      eventId: 'lead_created',
      title: 'New lead: Dana Whitfield (Globex Corp)',
      body: 'New lead created: Dana Whitfield, VP Ops at Globex Corp — source: website demo request.',
      fields: [
        { label: 'Company', value: 'Globex Corp · 500–1,000 employees' },
        { label: 'Source', value: 'Website · demo request' },
      ],
      actions: [{ label: 'Open lead', style: 'primary' }],
    },
    {
      eventId: 'deal_won',
      title: 'Opportunity won: Globex Corp — Team plan',
      body: 'Emma Wilson closed the deal “Globex Corp — Team plan” at $18,400 ARR. 🎉',
      fields: [
        { label: 'Amount', value: '$18,400 ARR' },
        { label: 'Owner', value: 'Emma Wilson' },
      ],
    },
    {
      eventId: 'case_escalated',
      title: 'Case #4012 escalated: login failures after migration',
      body: 'Case #4012 “login failures after migration” was escalated to Tier 2 (SLA: 4h).',
      fields: [
        { label: 'Account', value: 'Initech' },
        { label: 'Priority', value: 'High · SLA 4 hours' },
      ],
    },
  ],
  hubspot: [
    {
      eventId: 'form_submission',
      title: 'New form submission: Contact sales',
      body: 'Nina Rossi (nina@umbrella.test) submitted “Contact sales” — interested in Team plan.',
      fields: [
        { label: 'Email', value: 'nina@umbrella.test' },
        { label: 'Interest', value: 'Team plan · 40 seats' },
      ],
    },
    {
      eventId: 'deal_stage_changed',
      title: 'Deal moved: Umbrella Corp → Proposal sent',
      body: 'Tom Nguyen moved “Umbrella Corp — Team plan” from Qualified to Proposal sent.',
      fields: [
        { label: 'Stage', value: 'Qualified → Proposal sent' },
        { label: 'Amount', value: '$9,600 ARR' },
      ],
    },
  ],
  dropbox: [
    {
      eventId: 'file_shared',
      title: 'Marcus Reid shared “FY25-planning.numbers”',
      body: 'Marcus Reid shared “FY25-planning.numbers” (2.3 MB) with can-edit access.',
      fields: [
        { label: 'Access', value: 'Can edit' },
        { label: 'Folder', value: 'Planning / 2025' },
      ],
      actions: [{ label: 'Open in Dropbox', style: 'primary' }],
    },
    {
      eventId: 'folder_updated',
      title: '6 files added to “Brand assets”',
      body: 'Priya Patel added 6 files to the shared folder “Brand assets”.',
      fields: [{ label: 'Latest', value: 'hero-illustration-v2.png' }],
    },
  ],
  box: [
    {
      eventId: 'file_shared',
      title: 'Shared: “Acme — Q4 roadmap.pptx”',
      body: 'Sarah Chen shared “Acme — Q4 roadmap.pptx” via Box with the whole workspace.',
      fields: [
        { label: 'Size', value: '8.7 MB · 24 slides' },
        { label: 'Access', value: 'People in Acme Inc' },
      ],
      actions: [{ label: 'Preview', style: 'primary' }],
    },
    {
      eventId: 'collaborator_added',
      title: 'New collaborator on “Contracts”',
      body: 'Marcus Reid added Tom Nguyen as a collaborator on the folder “Contracts” (viewer).',
      fields: [{ label: 'Role', value: 'Viewer' }],
    },
  ],
  notion: [
    {
      eventId: 'page_shared',
      title: 'Shared with you: “Acme — Engineering wiki”',
      body: 'Priya Patel shared the Notion page “Acme — Engineering wiki” with the workspace.',
      fields: [
        { label: 'Type', value: 'Wiki · 14 sub-pages' },
        { label: 'Access', value: 'Can comment' },
      ],
      actions: [{ label: 'Open page', style: 'primary' }],
    },
    {
      eventId: 'comment_added',
      title: 'Mentioned in “On-call rotation”',
      body: 'Diego Alvarez mentioned you in a comment on “On-call rotation”: “@you can you take Thursday?”',
      fields: [{ label: 'Page', value: 'On-call rotation' }],
    },
    {
      eventId: 'database_updated',
      title: '“Release tracker” updated',
      body: 'Emma Wilson updated the database “Release tracker” — v0.9.4 moved to In progress.',
      fields: [
        { label: 'Property', value: 'Status → In progress' },
        { label: 'Row', value: 'v0.9.4' },
      ],
    },
  ],
  airtable: [
    {
      eventId: 'record_assigned',
      title: 'Record assigned: “Design — App Store screenshots”',
      body: 'You were assigned the record “Design — App Store screenshots” in the Launch base.',
      fields: [
        { label: 'Base', value: 'Launch' },
        { label: 'Table', value: 'Assets' },
      ],
    },
    {
      eventId: 'view_created',
      title: 'New view: “Blocked only”',
      body: 'Tom Nguyen created a new grid view “Blocked only” in the Launch base (Tasks table).',
      fields: [{ label: 'Filter', value: 'Status = Blocked' }],
    },
  ],
  zendesk: [
    {
      eventId: 'ticket_created',
      title: 'Ticket #8841: “Slack import stuck at 40%”',
      body: 'New ticket #8841 “Slack import stuck at 40%” (Normal · Acme Inc) from helpdesk form.',
      fields: [
        { label: 'Requester', value: 'dana@globex.test' },
        { label: 'Priority', value: 'Normal' },
      ],
      actions: [{ label: 'Open ticket', style: 'primary' }],
    },
    {
      eventId: 'ticket_escalated',
      title: 'Ticket #8836 escalated to High',
      body: 'Ticket #8836 “2FA codes not arriving” was escalated to High priority after SLO warning.',
      fields: [
        { label: 'SLO', value: 'First response due in 22 min' },
        { label: 'Assignee', value: 'Tom Nguyen' },
      ],
    },
    {
      eventId: 'csat_received',
      title: 'CSAT ★★★★★ on ticket #8829',
      body: 'Marcus’s request “Export DM history” received a 5/5 satisfaction rating: “Blazing fast support!”',
      fields: [
        { label: 'Rating', value: '5 / 5' },
        { label: 'Comment', value: '“Blazing fast support!”' },
      ],
    },
  ],
  miro: [
    {
      eventId: 'board_shared',
      title: 'Board shared: “Q4 journey mapping”',
      body: 'Emma Wilson shared the Miro board “Q4 journey mapping” — 42 stickies, 3 frames.',
      fields: [
        { label: 'Board', value: 'Q4 journey mapping' },
        { label: 'Access', value: 'Can edit' },
      ],
      actions: [{ label: 'Open board', style: 'primary' }],
    },
    {
      eventId: 'comment_added',
      title: 'Comment on “Retrospective Nov”',
      body: 'Priya Patel commented on “Retrospective Nov”: “Let’s double the ‘went well’ column 😄”',
      fields: [{ label: 'Board', value: 'Retrospective Nov' }],
    },
  ],
  figma: [
    {
      eventId: 'file_comment',
      title: 'Comment on “Onboarding flow v3”',
      body: 'Sarah Chen commented on “Onboarding flow v3”: “Step 2 tooltip should auto-dismiss after 4s.”',
      fields: [
        { label: 'File', value: 'Onboarding flow v3' },
        { label: 'Page', value: 'Cover · Step 2' },
      ],
      actions: [{ label: 'Reply in Figma', style: 'primary' }],
    },
    {
      eventId: 'prototype_shared',
      title: 'Prototype shared: “Checklist — mobile”',
      body: 'Emma Wilson shared a prototype of “Checklist — mobile” for review (expires in 7 days).',
      fields: [
        { label: 'Flow', value: 'Checklist · 6 frames' },
        { label: 'Access', value: 'Anyone with the link' },
      ],
    },
  ],
  loom: [
    {
      eventId: 'video_shared',
      title: 'New Loom: “Migration tool walkthrough” (6:24)',
      body: 'Marcus Reid shared a Loom video “Migration tool walkthrough” — 6 min 24 s.',
      fields: [
        { label: 'Length', value: '6:24' },
        { label: 'Topic', value: 'Slack import demo + Q&A' },
      ],
      actions: [{ label: 'Watch video', style: 'primary' }],
    },
  ],
  zapier: [
    {
      eventId: 'zap_completed',
      title: 'Zap completed: “Typeform → #product”',
      body: 'Zap “Typeform → #product” ran in 1.8s — 1 new response forwarded.',
      fields: [
        { label: 'Task', value: 'New response → post message' },
        { label: 'Duration', value: '1.8 seconds' },
      ],
    },
    {
      eventId: 'zap_error',
      title: 'Zap errored: “Invoices → Drive”',
      body: 'Zap “Invoices → Drive” failed after 3 retries — “Drive: storage quota exceeded”.',
      fields: [
        { label: 'Step', value: 'Upload file to Drive' },
        { label: 'Error', value: 'storage quota exceeded' },
      ],
      actions: [{ label: 'Fix zap', style: 'primary' }],
    },
  ],
  'outlook-calendar': [
    {
      eventId: 'meeting_invite',
      title: 'Invitation: “Customer sync — Globex”',
      body: 'Emma Wilson invited you to “Customer sync — Globex” (Teams meeting, 30 min).',
      fields: [
        { label: 'When', value: 'Tomorrow · 11:00 AM – 11:30 AM' },
        { label: 'Where', value: 'Microsoft Teams' },
      ],
      actions: [
        { label: 'Accept', style: 'primary' },
        { label: 'Decline', style: 'default' },
      ],
    },
    {
      eventId: 'event_reminder',
      title: 'Reminder: “1:1 Sarah / Priya” in 10 minutes',
      body: '“1:1 Sarah / Priya” starts in 10 minutes (recurring weekly).',
      fields: [{ label: 'When', value: 'Today · 4:20 PM – 4:50 PM' }],
    },
  ],
  canva: [
    {
      eventId: 'design_shared',
      title: 'Design shared: “Launch social kit”',
      body: 'Emma Wilson shared the Canva design “Launch social kit” (12 pages) for review.',
      fields: [
        { label: 'Type', value: 'Social kit · 12 pages' },
        { label: 'Access', value: 'Can comment' },
      ],
      actions: [{ label: 'Open design', style: 'primary' }],
    },
    {
      eventId: 'comment_added',
      title: 'Comment on “App Store screenshots”',
      body: 'Nina Rossi commented on “App Store screenshots”: “Headline contrast looks great on 3!”',
      fields: [{ label: 'Page', value: 'Screen 3' }],
    },
  ],
}

// ─── The catalog (mirrors the Slack App Directory) ────────────────────────────

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    tagline: 'Meeting reminders & event updates in channel',
    description:
      'Keep the team on time. Posts reminders before meetings, and shares new, updated or cancelled calendar events straight into any channel.',
    category: 'Google Workspace',
    icon: 'calendar',
    color: '#1a73e8',
    scopes: ['Read calendar events', 'Read event guests', 'Manage event reminders'],
    sampleAccounts: ['sarah@acme.test', 'acme-team@acme.test'],
    events: [
      { id: 'meeting_reminder', label: 'Meeting reminders', description: 'Post 15 minutes before a meeting starts', defaultOn: true },
      { id: 'event_created', label: 'New events', description: 'When someone schedules a new event', defaultOn: true },
      { id: 'event_updated', label: 'Event updates', description: 'Rescheduled or moved events', defaultOn: true },
      { id: 'event_cancelled', label: 'Cancelled events', description: 'When an event is called off', defaultOn: false },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    tagline: 'File shares & comment activity',
    description:
      'See it when it’s shared. Every file shared with your team, new comment, and new version lands in the channel with one-click open.',
    category: 'Google Workspace',
    icon: 'hard-drive',
    color: '#0f9d58',
    scopes: ['Read files shared with you', 'Read comments', 'View file metadata'],
    sampleAccounts: ['sarah@acme.test', 'Acme Inc shared drive'],
    events: [
      { id: 'file_shared', label: 'Files shared', description: 'When a file is shared with the team', defaultOn: true },
      { id: 'comment_added', label: 'Comments', description: 'New comments on shared files', defaultOn: true },
      { id: 'file_updated', label: 'Version updates', description: 'New versions of shared files', defaultOn: false },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Pull requests, pushes & CI right in chat',
    description:
      'Ship without switching tabs. Pull requests, reviews, pushes, and CI results from your repositories post into your engineering channels.',
    category: 'Developer tools',
    icon: 'github',
    color: '#24292f',
    scopes: ['Read repositories', 'Read pull requests', 'Read commit statuses', 'Read issues'],
    sampleAccounts: ['acme-inc', 'marcus-reid'],
    events: [
      { id: 'pr_opened', label: 'Pull requests', description: 'Opened PRs and review requests', defaultOn: true },
      { id: 'push', label: 'Pushes', description: 'New commits pushed to tracked branches', defaultOn: true },
      { id: 'ci_failed', label: 'CI failures', description: 'When a workflow fails on a tracked branch', defaultOn: true },
      { id: 'review_requested', label: 'Review requests', description: 'When your review is requested', defaultOn: false },
    ],
  },
  {
    id: 'jira',
    name: 'Jira Software',
    tagline: 'Issues, sprints & status changes',
    description:
      'Track work as it moves. New issues, status transitions, and sprint kick-offs from your Jira site post into channel.',
    category: 'Developer tools',
    icon: 'bug',
    color: '#0052cc',
    scopes: ['Read issues', 'Read sprints', 'Read projects'],
    sampleAccounts: ['acme.atlassian.net'],
    events: [
      { id: 'issue_created', label: 'New issues', description: 'Issues created in tracked projects', defaultOn: true },
      { id: 'status_changed', label: 'Status changes', description: 'When issues move between columns', defaultOn: true },
      { id: 'sprint_started', label: 'Sprint starts', description: 'When a new sprint begins', defaultOn: false },
    ],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    tagline: 'Join meetings & get recordings',
    description:
      'Never miss the standup. Meeting-start announcements with join buttons, and cloud recordings delivered to the channel.',
    category: 'Meetings & video',
    icon: 'video',
    color: '#2d8cff',
    scopes: ['Read meetings', 'Read recordings', 'View meeting participants'],
    sampleAccounts: ['sarah@acme.test', 'Acme Inc account'],
    events: [
      { id: 'meeting_started', label: 'Meetings started', description: 'Post with a Join button when a meeting begins', defaultOn: true },
      { id: 'recording_ready', label: 'Recordings', description: 'Cloud recordings when they’re ready', defaultOn: true },
    ],
  },
  {
    id: 'loom',
    name: 'Loom',
    tagline: 'Async video updates in channel',
    description:
      'Explain once, reach everyone. New Loom videos shared with the workspace post with a one-click watch button.',
    category: 'Meetings & video',
    icon: 'film',
    color: '#625df5',
    scopes: ['Read shared videos', 'Read video metadata'],
    sampleAccounts: ['marcus@acme.test', 'Acme Inc workspace'],
    events: [{ id: 'video_shared', label: 'Videos shared', description: 'When someone shares a Loom with the workspace', defaultOn: true }],
  },
  {
    id: 'trello',
    name: 'Trello',
    tagline: 'Board moves, assignments & due dates',
    description:
      'Watch cards travel your board. Card moves, assignments, and due-date nudges from your Trello boards post into channel.',
    category: 'Productivity',
    icon: 'trello',
    color: '#0079bf',
    scopes: ['Read boards', 'Read cards', 'Read members'],
    sampleAccounts: ['acme-design', 'sarah@acme.test'],
    events: [
      { id: 'card_moved', label: 'Card moves', description: 'When cards change lists', defaultOn: true },
      { id: 'card_assigned', label: 'Assignments', description: 'When you’re assigned a card', defaultOn: true },
      { id: 'due_soon', label: 'Due soon', description: 'Cards due within a day', defaultOn: false },
    ],
  },
  {
    id: 'asana',
    name: 'Asana',
    tagline: 'Task assignments & completions',
    description:
      'Keep work visible. Task assignments, completions, and project updates from Asana post straight into your team channels.',
    category: 'Productivity',
    icon: 'clipboard',
    color: '#f06a52',
    scopes: ['Read tasks', 'Read projects', 'Read portfolios'],
    sampleAccounts: ['acme.inc', 'tom@acme.test'],
    events: [
      { id: 'task_assigned', label: 'Task assignments', description: 'When you’re assigned a task', defaultOn: true },
      { id: 'task_completed', label: 'Completions', description: 'When tasks are marked complete', defaultOn: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Page shares, mentions & updates',
    description:
      'Your docs, in flow. Shared pages, comment mentions, and database updates from your Notion workspace post into channel.',
    category: 'Productivity',
    icon: 'notebook',
    color: '#181818',
    scopes: ['Read shared pages', 'Read comments', 'Read databases'],
    sampleAccounts: ['Acme Inc workspace', 'priya@acme.test'],
    events: [
      { id: 'page_shared', label: 'Pages shared', description: 'Pages shared with the workspace', defaultOn: true },
      { id: 'comment_added', label: 'Mentions & comments', description: 'When you’re mentioned in a comment', defaultOn: true },
      { id: 'database_updated', label: 'Database updates', description: 'Records changed in tracked databases', defaultOn: false },
    ],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    tagline: 'Record assignments & new views',
    description:
      'Bases, in motion. Record assignments and new views from Airtable bases post into your team channel.',
    category: 'Productivity',
    icon: 'table',
    color: '#fcb400',
    scopes: ['Read bases', 'Read records', 'Read views'],
    sampleAccounts: ['Acme Inc bases'],
    events: [
      { id: 'record_assigned', label: 'Record assignments', description: 'When you’re assigned a record', defaultOn: true },
      { id: 'view_created', label: 'New views', description: 'Views created in tracked bases', defaultOn: false },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    tagline: 'Leads, won deals & escalations',
    description:
      'Revenue signal, live. New leads, closed-won opportunities, and escalated cases from Salesforce post into your sales channels.',
    category: 'CRM & support',
    icon: 'cloud',
    color: '#00a1e0',
    scopes: ['Read leads', 'Read opportunities', 'Read cases'],
    sampleAccounts: ['Acme Inc (production)', 'sandbox'],
    events: [
      { id: 'lead_created', label: 'New leads', description: 'Leads created in Salesforce', defaultOn: true },
      { id: 'deal_won', label: 'Won deals', description: 'Opportunities marked closed-won', defaultOn: true },
      { id: 'case_escalated', label: 'Escalations', description: 'Cases escalated to a higher tier', defaultOn: false },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    tagline: 'Form submissions & deal stages',
    description:
      'Marketing + sales in one feed. Form submissions and deal-stage changes from HubSpot post into your growth channels.',
    category: 'CRM & support',
    icon: 'gauge',
    color: '#ff7a59',
    scopes: ['Read forms', 'Read deals', 'Read contacts'],
    sampleAccounts: ['Acme Inc portal'],
    events: [
      { id: 'form_submission', label: 'Form submissions', description: 'New submissions on tracked forms', defaultOn: true },
      { id: 'deal_stage_changed', label: 'Deal stage changes', description: 'When deals move stages', defaultOn: true },
    ],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    tagline: 'Tickets, escalations & CSAT',
    description:
      'Support that everyone can see. New tickets, SLA escalations, and satisfaction ratings from Zendesk post into channel.',
    category: 'CRM & support',
    icon: 'lifebuoy',
    color: '#03363d',
    scopes: ['Read tickets', 'Read satisfaction ratings', 'Read SLA policies'],
    sampleAccounts: ['acme.zendesk.com'],
    events: [
      { id: 'ticket_created', label: 'New tickets', description: 'Tickets created in tracked views', defaultOn: true },
      { id: 'ticket_escalated', label: 'Escalations', description: 'Priority raised or SLA at risk', defaultOn: true },
      { id: 'csat_received', label: 'CSAT ratings', description: 'Good and bad satisfaction ratings', defaultOn: false },
    ],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    tagline: 'Shared files & folder activity',
    description:
      'Everything the team shares. File shares and folder updates from Dropbox post into channel with quick-open links.',
    category: 'File storage',
    icon: 'dropbox',
    color: '#0061ff',
    scopes: ['Read shared files', 'Read folders', 'View file metadata'],
    sampleAccounts: ['Acme Inc team', 'marcus@acme.test'],
    events: [
      { id: 'file_shared', label: 'Files shared', description: 'Files shared with the team', defaultOn: true },
      { id: 'folder_updated', label: 'Folder updates', description: 'Files added to shared folders', defaultOn: true },
    ],
  },
  {
    id: 'box',
    name: 'Box',
    tagline: 'Enterprise content, in channel',
    description:
      'Secure sharing, visible. File shares and new collaborators from Box post into your channel.',
    category: 'File storage',
    icon: 'box',
    color: '#0061d5',
    scopes: ['Read shared files', 'Read collaborations', 'View file metadata'],
    sampleAccounts: ['Acme Inc enterprise'],
    events: [
      { id: 'file_shared', label: 'Files shared', description: 'Files shared with you or the team', defaultOn: true },
      { id: 'collaborator_added', label: 'New collaborators', description: 'Collaborators added to shared folders', defaultOn: false },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    tagline: 'Design comments & prototype shares',
    description:
      'Design feedback at the speed of chat. File comments and shared prototypes from Figma post into your design channels.',
    category: 'Design',
    icon: 'pen-tool',
    color: '#a259ff',
    scopes: ['Read files', 'Read comments', 'Read prototypes'],
    sampleAccounts: ['Acme Inc team', 'emma@acme.test'],
    events: [
      { id: 'file_comment', label: 'File comments', description: 'New comments on tracked files', defaultOn: true },
      { id: 'prototype_shared', label: 'Prototype shares', description: 'Prototypes shared for review', defaultOn: true },
    ],
  },
  {
    id: 'miro',
    name: 'Miro',
    tagline: 'Boards & comment activity',
    description:
      'Whiteboard together, apart. Shared boards and comments from Miro post into channel so workshops stay visible.',
    category: 'Design',
    icon: 'presentation',
    color: '#ffdd00',
    scopes: ['Read boards', 'Read comments'],
    sampleAccounts: ['Acme Inc team'],
    events: [
      { id: 'board_shared', label: 'Boards shared', description: 'Boards shared with the team', defaultOn: true },
      { id: 'comment_added', label: 'Comments', description: 'New comments on shared boards', defaultOn: false },
    ],
  },
  {
    id: 'canva',
    name: 'Canva',
    tagline: 'Design shares & feedback',
    description:
      'Beautiful work, broadcast. Designs shared for review and Canva comments post into your channel.',
    category: 'Design',
    icon: 'palette',
    color: '#00c4cc',
    scopes: ['Read designs', 'Read comments'],
    sampleAccounts: ['Acme Inc team', 'nina@acme.test'],
    events: [
      { id: 'design_shared', label: 'Designs shared', description: 'Designs shared with the team', defaultOn: true },
      { id: 'comment_added', label: 'Comments', description: 'New comments on shared designs', defaultOn: false },
    ],
  },
  {
    id: 'outlook-calendar',
    name: 'Outlook Calendar',
    tagline: 'Invites & reminders from Microsoft 365',
    description:
      'For the Microsoft 365 crowd. Meeting invitations and event reminders from Outlook Calendar post into any channel.',
    category: 'Microsoft',
    icon: 'calendar-days',
    color: '#0f6cbd',
    scopes: ['Read calendar events', 'Read event attendees', 'Send reminders'],
    sampleAccounts: ['emma@acme.test', 'Acme Inc tenant'],
    events: [
      { id: 'meeting_invite', label: 'Meeting invites', description: 'New invitations with Accept / Decline', defaultOn: true },
      { id: 'event_reminder', label: 'Event reminders', description: 'Reminders before events start', defaultOn: true },
    ],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    tagline: 'Automate anything with 7,000+ apps',
    description:
      'The automation hub. Zap completions and errors from your Zapier workflows post into channel so automations stay accountable.',
    category: 'Automation',
    icon: 'zap',
    color: '#ff4a00',
    scopes: ['Read zaps', 'Read task history'],
    sampleAccounts: ['Acme Inc workspace'],
    events: [
      { id: 'zap_completed', label: 'Zap completions', description: 'Successful runs of tracked zaps', defaultOn: true },
      { id: 'zap_error', label: 'Zap errors', description: 'Failed runs that need attention', defaultOn: true },
    ],
  },
]

export const CONNECTOR_CATEGORIES = [...new Set(CONNECTORS.map((c) => c.category))].sort()

export function getConnectorDef(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id)
}

// ─── Event simulation ─────────────────────────────────────────────────────────

/** Pick a realistic sample event (matching eventId when provided). */
export function pickEventInstance(def: ConnectorDef, eventId?: string): ConnectorEventInstance | null {
  const samples = CONNECTOR_SAMPLES[def.id] ?? []
  if (samples.length === 0) return null
  const pool = eventId ? samples.filter((s) => s.eventId === eventId) : samples
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── App users & message posting ──────────────────────────────────────────────

/** Find or create the connector's bot "app" user for this org. */
export async function ensureAppUser(orgId: string, def: ConnectorDef): Promise<User> {
  const email = `${def.id}@apps.acme.test`
  const existing = await db.user.findFirst({ where: { orgId, email } })
  if (existing) return existing
  return db.user.create({
    data: {
      orgId,
      email,
      name: def.name,
      // "app" users are rendered with an APP badge everywhere
      kind: 'app',
      role: 'member',
      title: `Connector · ${def.category}`,
      avatarColor: def.color,
      // App users never log in — random unusable hash
      passwordHash: `app:${Math.random().toString(36).slice(2)}`,
    },
  })
}

const messageInclude = {
  sender: { include: { agent: { select: { handle: true } } } },
  reactions: { include: { user: true } },
  files: true,
  _count: { select: { replies: true } },
} as const

/**
 * Post one connector event into the connection's channel as the app user,
 * with realtime fan-out. Shared by the simulator route and the connect flow.
 */
export async function postConnectorEvent(
  connection: ConnectorConnection,
  instance: ConnectorEventInstance,
): Promise<{ message: ReturnType<typeof serializeMessage>; channelName: string }> {
  const def = getConnectorDef(connection.connectorId)
  const payload = {
    event: instance.eventId,
    title: instance.title,
    fields: instance.fields ?? [],
    actions: instance.actions ?? [],
    footer: instance.footer ?? '',
  }
  const message = await db.message.create({
    data: {
      channelId: connection.channelId,
      senderId: connection.appUserId,
      body: instance.body,
      mentions: JSON.stringify({ userIds: [], specials: [] }),
      connectorId: connection.connectorId,
      connectorPayload: JSON.stringify(payload),
    },
    include: messageInclude,
  })
  const dto = serializeMessage(
    message as unknown as Parameters<typeof serializeMessage>[0],
  )
  void emitToChannel(connection.channelId, 'message:new', { message: dto }).catch(() => {})
  return { message: dto, channelName: def?.name ?? connection.connectorId }
}

// ─── Connection helpers ───────────────────────────────────────────────────────

export function defaultEventSubs(def: ConnectorDef): Record<string, boolean> {
  const subs: Record<string, boolean> = {}
  for (const event of def.events) subs[event.id] = event.defaultOn
  return subs
}

export function parseEventSubs(raw: string | null): Record<string, boolean> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) out[k] = v === true
    return out
  } catch {
    return {}
  }
}
