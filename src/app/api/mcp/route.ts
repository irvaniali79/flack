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
//          tools/call · resources/list · resources/read · prompts/list
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
          '(recent messages — list with resources/list, read with resources/read). ' +
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

    case 'resources/read': {
      const uri = typeof msg.params?.uri === 'string' ? msg.params.uri : ''
      // Scope enforcement mirrors tools (session playground = full access)
      if (actor.scopes && !actor.scopes.has('channels:read')) {
        return err(id, -32602, 'This API key lacks the "channels:read" scope required for resources')
      }
      const match = /^acme:\/\/channels\/([a-z0-9-]+)$/.exec(uri)
      if (!match) {
        return err(id, -32602, 'Invalid resource uri — expected acme://channels/{slug} (list with resources/list)')
      }
      const channel = await db.channel.findFirst({
        where: { orgId: actor.user.orgId, slug: match[1] },
        include: { members: { where: { userId: actor.user.id }, select: { userId: true } } },
      })
      if (!channel || (channel.kind !== 'public' && channel.members.length === 0)) {
        return err(id, -32602, `Resource not found: ${uri}`)
      }
      const messages = await db.message.findMany({
        where: { channelId: channel.id, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
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
      return ok(id, { prompts: [] })

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
      methods: ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list'],
      auth: 'Authorization: Bearer acme_… (API key) — manage keys in the app: Integrations view',
      note: 'Send JSON-RPC 2.0 requests via POST. SSE streaming is not enabled.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export const dynamic = 'force-dynamic'
