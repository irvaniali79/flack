// Acme Chat MCP server — Model Context Protocol over HTTP (Streamable HTTP
// transport, POST-only JSON-RPC 2.0). This is the platform's key
// differentiator: external AI clients (Claude Desktop, Cursor, custom agents)
// get first-class access to the same API humans use in the app.
//
// Auth:  `Authorization: Bearer acme_…` API key (create one in the app under
//        Integrations). Session-cookie auth also works — that is what the
//        in-app tool playground uses.
//
// Methods: initialize · notifications/initialized · ping · tools/list ·
//          tools/call · resources/list · resources/read ·
//          resources/templates/list · prompts/list · prompts/get
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { requireApiKeyUser, TOOL_SCOPE_REQUIREMENTS } from '@/lib/api-keys'
import { writeAudit } from '@/lib/audit'
import {
  MCP_TOOLS,
  ToolError,
  toolAddReaction,
  toolCreateChannel,
  toolGetThread,
  toolListChannels,
  toolPostMessage,
  toolReadChannel,
  toolSearchMessages,
} from '@/lib/mcp/tools'

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = { name: 'acme-chat', version: '1.0.0' }

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

function ok(id: JsonRpcId, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result })
}

function err(id: JsonRpcId, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } })
}

// ─── Actor resolution: Bearer key → user + scopes, else session cookie (playground) ──

async function resolveActor(request: Request): Promise<
  | { ok: true; user: { id: string; orgId: string; name: string }; scopes: Set<string> | null; via: 'api_key' | 'session' }
  | { ok: false; response: Response }
> {
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    try {
      const keyUser = await requireApiKeyUser(request)
      const user = await db.user.findUnique({ where: { id: keyUser.userId } })
      if (!user) return { ok: false, response: err(null, -32001, 'API key owner no longer exists') }
      return { ok: true, user: { id: user.id, orgId: user.orgId, name: user.name }, scopes: keyUser.scopes, via: 'api_key' }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid API key'
      return { ok: false, response: err(null, -32001, message) }
    }
  }
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return {
      ok: false,
      response: err(null, -32001, 'Authenticate with an API key (Authorization: Bearer acme_…) or a session cookie'),
    }
  }
  // Session (in-app playground) has full access
  return { ok: true, user: { id: sessionUser.id, orgId: sessionUser.orgId, name: sessionUser.name }, scopes: null, via: 'session' }
}

// ─── Tool dispatch ───────────────────────────────────────────────────────────

const TOOL_IMPLS: Record<
  string,
  (actor: { id: string; orgId: string; name: string }, args: Record<string, unknown>) => Promise<unknown>
> = {
  post_message: (a, args) =>
    toolPostMessage(a, {
      channel: String(args.channel ?? ''),
      text: String(args.text ?? ''),
      thread_ts: args.thread_ts ? String(args.thread_ts) : undefined,
    }),
  read_channel: (a, args) =>
    toolReadChannel(a, {
      channel: String(args.channel ?? ''),
      limit: args.limit === undefined ? undefined : Number(args.limit),
      thread_ts: args.thread_ts ? String(args.thread_ts) : undefined,
    }),
  search_messages: (a, args) =>
    toolSearchMessages(a, {
      query: String(args.query ?? ''),
      count: args.count === undefined ? undefined : Number(args.count),
    }),
  list_channels: (a) => toolListChannels(a),
  get_thread: (a, args) =>
    toolGetThread(a, {
      thread_ts: String(args.thread_ts ?? ''),
    }),
  add_reaction: (a, args) =>
    toolAddReaction(a, {
      channel: String(args.channel ?? ''),
      ts: String(args.ts ?? ''),
      emoji: String(args.emoji ?? ''),
    }),
  create_channel: (a, args) =>
    toolCreateChannel(a, {
      name: String(args.name ?? ''),
      topic: args.topic === undefined ? undefined : String(args.topic),
      private: args.private === undefined ? undefined : Boolean(args.private),
    }),
}

function textContent(text: string) {
  return { content: [{ type: 'text', text }], isError: false }
}

function toolErrorContent(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true }
}

// ─── Prompt templates ────────────────────────────────────────────────────────
// MCP prompts are reusable instruction templates the CLIENT fills and runs —
// the server renders arguments into the text; execution happens client-side
// with the tools this same server exposes.

interface PromptTemplate {
  name: string
  description: string
  arguments: { name: string; description: string; required?: boolean }[]
  render: (args: Record<string, string>) => { description: string; text: string }
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: 'catch_up',
    description:
      'Summarize what happened in a channel — reads the channel resource and produces a digest with decisions and open threads',
    arguments: [
      { name: 'channel', description: 'Channel slug, e.g. "engineering"', required: true },
      { name: 'hours', description: 'Look-back window in hours (default 24)' },
    ],
    render: (args) => ({
      description: `Catch up on #${args.channel ?? '…'}`,
      text:
        `Read the latest messages from the channel "${args.channel ?? ''}" (use the ` +
        `acme://channels/${args.channel ?? ''}/messages?limit=200 resource, or the read_channel tool). ` +
        `Focus on messages from the last ${args.hours ?? '24'} hours. ` +
        'Then summarize:\n' +
        '1. Key decisions that were made\n' +
        '2. Open questions or unresolved threads (with thread links)\n' +
        '3. Anything that needs my attention or a reply\n' +
        'Keep it tight — bullets, names, and message quotes only where they add clarity.',
    }),
  },
  {
    name: 'thread_review',
    description:
      'Extract decisions and action items from a thread — feed it a thread_ts and get a structured review',
    arguments: [{ name: 'thread_ts', description: 'Thread root message ts (get it from read_channel output)', required: true }],
    render: (args) => ({
      description: `Review thread ${args.thread_ts ?? '…'}`,
      text:
        `Use the get_thread tool with thread_ts "${args.thread_ts ?? ''}" to read the full thread, then produce:\n` +
        '1. DECISIONS — what was agreed (quote the deciding reply)\n' +
        '2. ACTION ITEMS — who owes what (mention the @person)\n' +
        '3. OPEN — what is still being debated\n' +
        'If the thread has no replies yet, say so and summarize the root message instead.',
    }),
  },
  {
    name: 'standup',
    description: 'Draft a standup update from a channel\u2019s recent activity — what shipped, what\u2019s in flight, what\u2019s blocked',
    arguments: [
      { name: 'channel', description: 'Channel slug to pull updates from, e.g. "engineering"', required: true },
    ],
    render: (args) => ({
      description: `Standup draft from #${args.channel ?? '…'}`,
      text:
        `Read the last 24 hours from "${args.channel ?? ''}" (acme://channels/${args.channel ?? ''}/messages?limit=200). ` +
        'Then draft MY standup update as if I posted in that channel yesterday:\n' +
        '• Shipped / landed (from deploys, PRs and completion talk)\n' +
        '• In flight (what the team was mid-way through)\n' +
        '• Blocked / needs help (explicit blockers or unanswered asks)\n' +
        'Write it in first person, ready to paste as a message. Keep it under 150 words.',
    }),
  },
]

// ─── POST: the MCP endpoint ──────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: JsonRpcRequest | JsonRpcRequest[] | null = null
  try {
    body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[]
  } catch {
    return err(null, -32700, 'Parse error: body must be valid JSON (JSON-RPC 2.0)')
  }

  const messages = Array.isArray(body) ? body : [body]
  const responses: Response[] = []

  for (const msg of messages) {
    responses.push(await handleMessage(request, msg))
  }

  // Notifications (no id) return 202 with no body; batches return an array
  const withId = responses.filter((r) => r.status !== 202)
  if (Array.isArray(body)) {
    if (withId.length === 0) return new Response(null, { status: 202 })
    const payloads = await Promise.all(withId.map((r) => r.json()))
    return Response.json(payloads)
  }
  return responses[0] ?? new Response(null, { status: 202 })
}

async function handleMessage(request: Request, msg: JsonRpcRequest): Promise<Response> {
  // Shape check — requests must carry jsonrpc "2.0" and a method
  if (typeof msg !== 'object' || msg === null || typeof msg.method !== 'string') {
    return err(null, -32600, 'Invalid Request: expected {jsonrpc:"2.0", method, params?, id?}')
  }
  if (msg.jsonrpc !== undefined && msg.jsonrpc !== '2.0') {
    return err(msg.id ?? null, -32600, `Invalid Request: jsonrpc must be "2.0"`)
  }

  const isNotification = msg.id === undefined
  const id = msg.id ?? null

  // initialize works pre-auth-free? No — MCP requires auth on every call for us.
  const actor = await resolveActor(request)
  if (!actor.ok) return err(id, -32001, 'Unauthorized')

  switch (msg.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: {},
          prompts: {},
        },
        serverInfo: SERVER_INFO,
        instructions:
          'Acme Chat MCP server. Tools: post_message, read_channel, search_messages, list_channels, ' +
          'get_thread, add_reaction, create_channel. Resources: acme://channels/{slug} ' +
          '(recent messages — list with resources/list, read with resources/read) and the ' +
          'parameterized template acme://channels/{slug}/messages?limit=N (see resources/templates/list). ' +
          'Prompts: catch_up, thread_review, standup (reusable instruction templates — list with prompts/list, render with prompts/get). ' +
          'All actions run as ' +
          actor.user.name + '.',
      })

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return new Response(null, { status: 202 })

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, { tools: MCP_TOOLS })

    case 'resources/list': {
      // One resource per channel the actor can read (member channels + public)
      const channels = await db.channel.findMany({
        where: {
          orgId: actor.user.orgId,
          isArchived: false,
          OR: [{ members: { some: { userId: actor.user.id } } }, { kind: 'public' }],
        },
        select: {
          slug: true,
          name: true,
          kind: true,
          topic: true,
          members: {
            where: { userId: { not: actor.user.id } },
            select: { user: { select: { name: true } } },
            take: 5,
          },
        },
        orderBy: { name: 'asc' },
      })
      return ok(id, {
        resources: channels.map((c) => {
          const otherNames = c.members.map((m) => m.user.name)
          const label =
            c.kind === 'dm'
              ? `DM: ${otherNames[0] ?? 'Direct message'}`
              : c.kind === 'group_dm'
                ? `Group DM: ${otherNames.slice(0, 3).join(', ')}${otherNames.length > 3 ? ` +${otherNames.length - 3}` : ''}`
                : `#${c.slug}`
          return {
            uri: `acme://channels/${c.slug}`,
            name: label,
            description:
              (c.topic && c.topic.trim().slice(0, 120)) ||
              `${c.kind === 'public' ? 'Public' : c.kind === 'private' ? 'Private' : c.kind === 'dm' ? 'Direct message' : 'Group DM'} channel — ${c.name}`,
            mimeType: 'application/json',
          }
        }),
      })
    }

    case 'resources/templates/list': {
      // Parameterized reads: one template covers every channel with a limit
      return ok(id, {
        resourceTemplates: [
          {
            uriTemplate: 'acme://channels/{slug}/messages?limit={limit}',
            name: 'Channel messages',
            description:
              'Latest messages from any readable channel. slug is the channel slug (see resources/list); ' +
              'limit is optional (1-200, default 50).',
            mimeType: 'application/json',
          },
        ],
      })
    }

    case 'resources/read': {
      const uri = typeof msg.params?.uri === 'string' ? msg.params.uri : ''
      // Scope enforcement mirrors tools (session playground = full access)
      if (actor.scopes && !actor.scopes.has('channels:read')) {
        return err(id, -32602, 'This API key lacks the "channels:read" scope required for resources')
      }
      // acme://channels/{slug}                → latest 50
      // acme://channels/{slug}/messages?limit=N → latest N (1-200)
      const match = /^acme:\/\/channels\/([a-z0-9-]+)(\/messages)?(?:\?limit=(\d+))?$/.exec(uri)
      if (!match) {
        return err(
          id,
          -32602,
          'Invalid resource uri — expected acme://channels/{slug} or acme://channels/{slug}/messages?limit=N (list with resources/list, templates with resources/templates/list)',
        )
      }
      const [, slug, , limitRaw] = match
      const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200)
      const channel = await db.channel.findFirst({
        where: { orgId: actor.user.orgId, slug },
        include: { members: { where: { userId: actor.user.id }, select: { userId: true } } },
      })
      if (!channel || (channel.kind !== 'public' && channel.members.length === 0)) {
        return err(id, -32602, `Resource not found: ${uri}`)
      }
      const messages = await db.message.findMany({
        where: { channelId: channel.id, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: {
          sender: { select: { name: true } },
          reactions: { select: { emoji: true } },
        },
      })
      return ok(id, {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                channel: { slug: channel.slug, name: channel.name, kind: channel.kind, topic: channel.topic },
                count: messages.length,
                messages: messages.reverse().map((m) => ({
                  ts: m.id,
                  thread_ts: m.parentId ?? null,
                  user: m.sender?.name ?? 'Unknown',
                  text: m.body,
                  reactions: m.reactions.map((r) => r.emoji),
                  ts_created: m.createdAt.toISOString(),
                })),
              },
              null,
              2,
            ),
          },
        ],
      })
    }

    case 'prompts/list':
      return ok(id, {
        prompts: PROMPT_TEMPLATES.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments,
        })),
      })

    case 'prompts/get': {
      const name = typeof msg.params?.name === 'string' ? msg.params.name : ''
      const template = PROMPT_TEMPLATES.find((p) => p.name === name)
      if (!template) {
        return err(id, -32602, `Unknown prompt "${name}" — available: ${PROMPT_TEMPLATES.map((p) => p.name).join(', ')}`)
      }
      const rawArgs = (msg.params?.arguments ?? {}) as Record<string, unknown>
      const args: Record<string, string> = {}
      for (const spec of template.arguments) {
        const value = rawArgs[spec.name]
        if (value !== undefined && value !== null) args[spec.name] = String(value)
        else if (spec.required) {
          return err(id, -32602, `Missing required argument "${spec.name}" for prompt "${name}"`)
        }
      }
      const rendered = template.render(args)
      return ok(id, {
        description: rendered.description,
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: rendered.text },
          },
        ],
      })
    }

    case 'tools/call': {
      const name = msg.params?.name
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
      if (typeof name !== 'string') return err(id, -32602, 'Invalid params: missing tool name')

      const impl = TOOL_IMPLS[name]
      if (!impl) {
        return ok(id, toolErrorContent(`Unknown tool "${name}". Available: ${MCP_TOOLS.map((t) => t.name).join(', ')}`))
      }

      // Per-key scope enforcement (session playground has full access)
      const requiredScope = TOOL_SCOPE_REQUIREMENTS[name]
      if (requiredScope && actor.scopes && !actor.scopes.has(requiredScope)) {
        return ok(
          id,
          toolErrorContent(
            `This API key is not allowed to call "${name}" — it requires the "${requiredScope}" scope. ` +
              `The key has: ${[...actor.scopes].join(', ') || 'none'}. Create a new key with the missing scope in the app (Integrations view).`,
          ),
        )
      }

      // Audit every tool call (API-key calls especially — these are external)
      void writeAudit({
        orgId: actor.user.orgId,
        actorId: actor.user.id,
        action: 'mcp.tool_call',
        target: name,
        meta: {
          via: actor.via,
          args: JSON.stringify(args).slice(0, 500),
        },
      })

      try {
        const result = await impl(actor.user, args)
        return ok(id, textContent(JSON.stringify(result, null, 2)))
      } catch (e) {
        if (e instanceof ToolError) return ok(id, toolErrorContent(e.message))
        console.error('[mcp] tool error:', e)
        return ok(id, toolErrorContent(`Tool "${name}" failed with an internal error`))
      }
    }

    default:
      if (isNotification) return new Response(null, { status: 202 })
      return err(id, -32601, `Method not found: ${msg.method}`)
  }
}

// ─── GET: unsupported (no SSE stream in this deployment) ─────────────────────

export async function GET() {
  return Response.json(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: PROTOCOL_VERSION,
      transport: 'http-jsonrpc',
      methods: ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list', 'prompts/list', 'prompts/get'],
      auth: 'Authorization: Bearer acme_… (API key) — manage keys in the app: Integrations view',
      note: 'Send JSON-RPC 2.0 requests via POST. SSE streaming is not enabled.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export const dynamic = 'force-dynamic'
