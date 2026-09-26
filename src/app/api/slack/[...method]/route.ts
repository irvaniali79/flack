// Slack Web API compatibility endpoint — POST/GET /api/slack/<method>.
//
//   curl -X POST http://<host>/api/slack/chat.postMessage \
//     -H "Authorization: Bearer flack_…" \
//     -H "Content-Type: application/json" \
//     -d '{"channel":"general","text":"hello from my Slack bot"}'
//
// Point existing Slack bots here by overriding their API base URL
// (SLACK_API_URL for @slack/bolt & python slack_sdk) and using an Flack API
// key in place of the xoxb- token. Responses use Slack's envelope: HTTP 200
// with { ok: true, … } or { ok: false, error }.
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { hashApiKey } from '@/lib/api-keys'
import { writeAudit } from '@/lib/audit'
import {
  SlackError,
  normalizeSlackToken,
  emojiListMap,
  slackAuthTest,
  slackChatPostMessage,
  slackChatUpdate,
  slackChatDelete,
  slackConversationsList,
  slackConversationsInfo,
  slackConversationsHistory,
  slackConversationsReplies,
  slackConversationsJoin,
  slackConversationsOpen,
  slackUsersList,
  slackUsersInfo,
  slackReactionsAdd,
  slackSearchMessages,
  slackGetPermalink,
  type SlackCtx,
} from '@/lib/slack/compat'

type RouteParams = { params: Promise<{ method?: string[] }> }

const MUTATING = new Set([
  'chat.postMessage',
  'chat.update',
  'chat.delete',
  'conversations.join',
  'conversations.open',
  'reactions.add',
])

// Slack methods we deliberately don't implement (ephemeral/interactive
// surfaces with no Flack equivalent) — reported distinctly from typos.
const NOT_IMPLEMENTED = new Set([
  'chat.postEphemeral',
  'chat.scheduleMessage',
  'chat.unfurl',
  'views.open',
  'views.publish',
  'views.update',
  'views.push',
  'dialog.open',
  'apps.connections.open',
  'oauth.access',
  'oauth.v2.access',
  'rtm.connect',
  'rtm.start',
  'conversations.create',
  'conversations.invite',
  'conversations.rename',
  'conversations.setTopic',
  'reminders.add',
])

function slackJson(body: Record<string, unknown>): Response {
  return Response.json(body, {
    headers: { 'cache-control': 'no-store', 'x-flack-slack-compat': '1' },
  })
}

function fail(error: string, detail?: string): Response {
  return slackJson({ ok: false, error, ...(detail ? { detail } : {}) })
}

// ─── Param parsing (query + JSON/form body) ──────────────────────────────────

async function parseParams(request: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {}
  const url = new URL(request.url)
  url.searchParams.forEach((value, key) => {
    params[key] = value
  })
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? ''
    try {
      if (contentType.includes('application/json')) {
        const json = (await request.json()) as Record<string, unknown> | null
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          for (const [key, value] of Object.entries(json)) {
            if (value !== null && value !== undefined && typeof value !== 'object') {
              params[key] = String(value)
            }
          }
        }
      } else if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
      ) {
        const form = await request.formData()
        form.forEach((value, key) => {
          if (typeof value === 'string') params[key] = value
        })
      }
    } catch {
      // malformed body → fall back to query params only
    }
  }
  return params
}

// ─── Auth: Bearer flack_… / token param → API key, else session cookie ────────

async function resolveCtx(
  request: Request,
  params: Record<string, string>,
): Promise<{ ok: true; ctx: SlackCtx } | { ok: false; response: Response }> {
  const header = request.headers.get('authorization') ?? ''
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1] ?? ''
  const rawToken = params.token || bearer
  let origin = new URL(request.url).origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'http'
  if (forwardedHost) origin = `${forwardedProto}://${forwardedHost}`

  if (rawToken) {
    const token = normalizeSlackToken(rawToken)
    if (!token.startsWith('flack_')) {
      return {
        ok: false,
        response: fail('invalid_auth', 'expected an flack_… API key (create one under Integrations)'),
      }
    }
    const record = await db.apiKey.findUnique({
      where: { keyHash: hashApiKey(token) },
      include: { user: { include: { agent: { select: { handle: true } } } } },
    })
    if (!record) return { ok: false, response: fail('invalid_auth') }
    if (record.revokedAt) return { ok: false, response: fail('token_revoked') }
    if (!record.user.isActive) return { ok: false, response: fail('account_inactive') }
    void db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

    const org = await db.org.findUnique({ where: { id: record.orgId } })
    if (!org) return { ok: false, response: fail('invalid_auth') }
    return {
      ok: true,
      ctx: {
        user: {
          id: record.user.id,
          orgId: record.orgId,
          name: record.user.name,
          kind: record.user.kind,
          role: record.user.role,
        },
        org: { id: org.id, name: org.name },
        via: 'api_key',
        keyPrefix: record.keyPrefix,
        origin,
      },
    }
  }

  // Session-cookie auth (in-app "try it" flows)
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return { ok: false, response: fail('not_authed', 'send Authorization: Bearer flack_… or a token param') }
  }
  const org = await db.org.findUnique({ where: { id: sessionUser.orgId } })
  if (!org) return { ok: false, response: fail('invalid_auth') }
  return {
    ok: true,
    ctx: {
      user: {
        id: sessionUser.id,
        orgId: sessionUser.orgId,
        name: sessionUser.name,
        kind: sessionUser.kind,
        role: sessionUser.role,
      },
      org: { id: org.id, name: org.name },
      via: 'session',
      origin,
    },
  }
}

// ─── Method dispatch table ───────────────────────────────────────────────────

type MethodImpl = (ctx: SlackCtx, params: Record<string, string>) => Promise<Record<string, unknown>>

const METHODS: Record<string, MethodImpl> = {
  'api.test': async (_ctx, params) => ({ ...params }),
  'auth.test': async (ctx) => slackAuthTest(ctx) as unknown as Record<string, unknown>,
  'chat.postMessage': slackChatPostMessage,
  'chat.update': slackChatUpdate,
  'chat.delete': slackChatDelete,
  'chat.getPermalink': slackGetPermalink,
  'conversations.list': slackConversationsList,
  'conversations.info': slackConversationsInfo,
  'conversations.history': slackConversationsHistory,
  'conversations.replies': slackConversationsReplies,
  'conversations.join': slackConversationsJoin,
  'conversations.open': slackConversationsOpen,
  'users.list': async (ctx) => slackUsersList(ctx) as unknown as Record<string, unknown>,
  'users.info': slackUsersInfo,
  'reactions.add': slackReactionsAdd,
  'search.messages': slackSearchMessages,
  'emoji.list': async () => ({ emoji: emojiListMap() }),
}

export const SUPPORTED_SLACK_METHODS = Object.keys(METHODS).sort()

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleSlack(request: Request, { params }: RouteParams): Promise<Response> {
  const { method: segments } = await params
  const method = (segments ?? []).join('/')
  const callParams = await parseParams(request)

  const auth = await resolveCtx(request, callParams)
  if (!auth.ok) return auth.response

  const impl = METHODS[method]
  if (!impl) {
    if (NOT_IMPLEMENTED.has(method)) {
      return fail('not_implemented', `${method} has no Flack equivalent — see supported methods in Integrations`)
    }
    return fail('unknown_method', `supported: ${SUPPORTED_SLACK_METHODS.join(', ')}`)
  }

  try {
    const result = (await impl(auth.ctx, callParams)) as Record<string, unknown>
    if (MUTATING.has(method)) {
      void writeAudit({
        orgId: auth.ctx.org.id,
        actorId: auth.ctx.user.id,
        action: 'slack.api_call',
        target: method,
        meta: {
          via: auth.ctx.via,
          key: auth.ctx.keyPrefix ?? null,
          channel: callParams.channel ?? null,
          ts: callParams.ts ?? callParams.timestamp ?? null,
        },
      })
    }
    return slackJson({ ok: true, ...result })
  } catch (e) {
    if (e instanceof SlackError) return fail(e.code, e.detail)
    console.error(`[slack:${method}]`, e)
    return fail('internal_error', 'unexpected server error')
  }
}

export async function POST(request: Request, params: RouteParams) {
  return handleSlack(request, params)
}

export async function GET(request: Request, params: RouteParams) {
  return handleSlack(request, params)
}

export const dynamic = 'force-dynamic'
