'use client'
// Slack bot API compatibility section — surfaces /api/slack/<method>.
// Lets teams point existing Slack bots (@slack/bolt, python slack_sdk, hubot…)
// at this workspace with a base-URL override + an Acme API key.
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  KeyRound,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CodeBlock, CopyButton } from './code-block'

const METHOD_GROUPS: Array<{ group: string; methods: string[]; hint: string }> = [
  { group: 'chat', methods: ['chat.postMessage', 'chat.update', 'chat.delete', 'chat.getPermalink'], hint: 'send · edit · delete · link' },
  { group: 'conversations', methods: ['conversations.list', 'conversations.info', 'conversations.history', 'conversations.replies', 'conversations.join', 'conversations.open'], hint: 'channels & threads' },
  { group: 'users', methods: ['users.list', 'users.info'], hint: 'directory' },
  { group: 'reactions', methods: ['reactions.add'], hint: 'emoji' },
  { group: 'search', methods: ['search.messages'], hint: 'full-text' },
  { group: 'auth & meta', methods: ['auth.test', 'api.test', 'emoji.list'], hint: 'token & misc' },
]

/** Live compat endpoint check — auth.test with the session cookie. */
function CompatStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      try {
        const res = await fetch('/api/slack/auth.test', { method: 'POST' })
        const data = (await res.json()) as { ok?: boolean }
        if (!cancelled) setStatus(data.ok === true ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    void ping()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') {
    return (
      <Badge variant="outline" className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> checking…
      </Badge>
    )
  }
  if (status === 'online') {
    return (
      <Badge variant="outline" className="h-6 gap-1.5 border-fuchsia-500/40 bg-fuchsia-500/10 px-2 text-[11px] font-medium text-fuchsia-600 dark:text-fuchsia-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-500" />
        </span>
        Slack API online
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="h-6 gap-1.5 border-destructive/40 px-2 text-[11px] text-destructive">
      <CircleDot className="h-3 w-3" aria-hidden /> offline
    </Badge>
  )
}

/** Interactive demo: send one message through the compat API as yourself. */
function TryItBox({ endpoint }: { endpoint: string }) {
  const [text, setText] = useState('Hello from the Slack-compatible API 👋')
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [result, setResult] = useState<string | null>(null)
  const { toast } = useToast()

  const send = async () => {
    if (!text.trim() || state === 'sending') return
    setState('sending')
    setResult(null)
    try {
      const res = await fetch('/api/slack/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'general', text }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; ts?: string; detail?: string }
      if (data.ok) {
        setState('done')
        setResult(JSON.stringify(data, null, 2))
        toast({ title: 'Posted to #general', description: 'via the Slack-compatible API — check the channel.' })
      } else {
        setState('idle')
        setResult(JSON.stringify(data, null, 2))
        toast({ title: `error: ${data.error}`, description: data.detail ?? undefined, variant: 'destructive' })
      }
    } catch {
      setState('idle')
      toast({ title: 'Request failed', variant: 'destructive' })
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setState('idle')
          }}
          placeholder="Message #general as a bot…"
          className="h-9 min-w-0 flex-1 bg-background font-mono text-xs"
          aria-label="Test message text"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
        />
        <Button size="sm" className="h-9 gap-1.5" onClick={() => void send()} disabled={!text.trim() || state === 'sending'}>
          {state === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          Send via API
        </Button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        POSTs <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground/80">chat.postMessage</code>
        to <span className="font-mono text-[10px]">{endpoint}/chat.postMessage</span> with your session — exactly what a bot does with a key.
      </p>
      {result && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            {state === 'done' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> response — ok: true
              </>
            ) : (
              <>
                <CircleDot className="h-3.5 w-3.5 text-destructive" aria-hidden /> response
              </>
            )}
          </p>
          <CodeBlock code={result} language="json" highlight />
        </div>
      )}
    </div>
  )
}

export function SlackApiSection({ origin }: { origin: string }) {
  const endpoint = `${origin}/api/slack`

  const curlSnippet = `curl -X POST ${endpoint}/chat.postMessage \\
  -H "Authorization: Bearer acme_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"general","text":"*hello* from my Slack bot"}'`

  const boltSnippet = `// @slack/bolt — keep your bot code, change two env vars
import bolt from '@slack/bolt';

const app = new bolt.App({
  token: process.env.SLACK_BOT_TOKEN,        // acme_… key from this page
  appToken: process.env.SLACK_APP_TOKEN,     // any non-empty string
  socketMode: false,
  // the one line that migrates the bot:
  SLACK_API_URL: "${endpoint}/",
});

app.message("deploy", async ({ say }) => {
  await say("deploy logged ✅");             // chat.postMessage under the hood
});

await app.start();`

  const pythonSnippet = `# python slack_sdk — same two-line migration
import os
from slack_sdk import WebClient

client = WebClient(
    token=os.environ["SLACK_BOT_TOKEN"],     # acme_… key
    base_url="${endpoint}/",
)

client.chat_postMessage(channel="general", text="*hello* from Python 🐍")`

  return (
    <section aria-labelledby="slack-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-600/15 text-fuchsia-600 dark:text-fuchsia-400">
            <Bot className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 id="slack-heading" className="text-sm font-bold">
              Slack bot API compatibility
            </h2>
            <p className="text-xs text-muted-foreground">
              Point existing Slack bots at this workspace — no code changes, just a base URL.
            </p>
          </div>
        </div>
        <CompatStatus />
      </div>

      <div className="space-y-4 rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.07] via-background to-background p-4">
        {/* migration story */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="h-5 gap-1 bg-background px-1.5 text-[10px] font-medium shadow-sm">
            <Sparkles className="h-3 w-3 text-fuchsia-500" aria-hidden /> zero-code bot migration
          </Badge>
          <span className="flex flex-wrap items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">slack.com/api</code>
            <ArrowRight className="h-3 w-3" aria-hidden />
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">{origin}/api/slack</code>
            <span>+ <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">xoxb-…</code> → <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">acme_…</code></span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs shadow-inner">
            {origin ? `${endpoint}/<method>` : '…'}
          </code>
          <CopyButton text={`${endpoint}/`} label="Copy base URL" />
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Responses follow the Slack Web API envelope (<code className="rounded bg-muted px-1 font-mono text-[10px]">{`{ ok: true, … }`}</code> /{' '}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">{`{ ok: false, error }`}</code>). Messages posted by bots run through the
          same pipeline as human ones — mrkdwn is converted, <code className="rounded bg-muted px-1 font-mono text-[10px]">&lt;@user&gt;</code> mentions
          resolve and notify, AI agents reply, workflows fire.
        </p>

        {/* supported methods */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {METHOD_GROUPS.map((g) => (
            <div key={g.group} className="rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-fuchsia-500/30">
              <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold">{g.group}</span>
                <span className="text-[10px] text-muted-foreground">{g.hint}</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {g.methods.map((m) => (
                  <code
                    key={m}
                    className="rounded bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-fuchsia-700 dark:text-fuchsia-300"
                  >
                    {m}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* recipes */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">curl — raw HTTP</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">JSON body, form-encoded, or query params — all accepted.</p>
              </div>
            </div>
            <CodeBlock code={curlSnippet} language="bash" className="flex-1" />
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">@slack/bolt (Node)</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">One env var moves your whole Bolt app.</p>
              </div>
            </div>
            <CodeBlock code={boltSnippet} language="javascript" className="flex-1" />
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <span className="text-sm" aria-hidden>🐍</span>
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">python slack_sdk</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">base_url + token — everything else stays.</p>
              </div>
            </div>
            <CodeBlock code={pythonSnippet} language="python" className="flex-1" />
          </div>
        </div>

        {/* live demo */}
        <TryItBox endpoint={endpoint} />
      </div>
    </section>
  )
}
