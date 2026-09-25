'use client'
// Integrations view — the developer surface for the platform's key
// differentiators: a Model Context Protocol server and a Slack-compatible
// Web API. Five sections:
//   1. MCP endpoint overview + connection snippets (curl / Claude / Cursor)
//   2. Slack bot API compatibility (zero-code bot migration)
//   3. API key management (Bearer auth for external clients)
//   4. Tool playground (call tools live, exactly as an AI client would)
//   5. Resources (channels as readable MCP resources)
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  Cable,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  Command,
  Hash,
  Layers,
  Loader2,
  Plug,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useViewStore } from '@/lib/view-store'
import type { McpToolInfo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CodeBlock, CopyButton } from './code-block'
import { ApiKeysSection } from './api-keys-section'
import { ToolPlayground } from './tool-playground'
import { SlackApiSection } from './slack-api-section'

/** Live server status — pings the MCP endpoint with the session cookie. */
function ServerStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      try {
        const res = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        })
        const data = (await res.json()) as { result?: unknown; error?: unknown }
        if (!cancelled) setStatus(data.result !== undefined ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    void ping()
    const onFocus = () => void ping()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
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
      <Badge variant="outline" className="h-6 gap-1.5 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        MCP server online
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="h-6 gap-1.5 border-destructive/40 px-2 text-[11px] text-destructive">
      <CircleDot className="h-3 w-3" aria-hidden /> offline
    </Badge>
  )
}

/** One connection recipe card: client icon, name, blurb + code snippet. */
function ConnectionCard({
  icon,
  title,
  blurb,
  code,
  language,
}: {
  icon: React.ReactNode
  title: string
  blurb: string
  code: string
  language: string
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">{blurb}</p>
        </div>
      </div>
      <CodeBlock code={code} language={language} className="flex-1" />
    </div>
  )
}

/** Full tool reference with input schemas (collapsible). */
function ToolReference({ tools }: { tools: McpToolInfo[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby="toolref-heading" className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/50"
      >
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
        <h2 id="toolref-heading" className="text-sm font-bold">
          Tool reference
        </h2>
        <span className="text-xs text-muted-foreground">— {tools.length} tools with JSON schemas</span>
      </button>
      {open && (
        <div className="grid gap-3 md:grid-cols-2">
          {tools.map((t) => (
            <div key={t.name} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <code className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {t.name}
                </code>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>
              <CodeBlock code={JSON.stringify(t.inputSchema, null, 2)} language="schema" highlight />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** MCP resources — channel context for AI clients (resources/list + resources/read). */
function ResourcesSection({ origin }: { origin: string }) {
  const [resources, setResources] = useState<
    { uri: string; name: string; description?: string; mimeType?: string }[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'resources/list' }),
      })
      const data = (await res.json()) as {
        result?: { resources?: { uri: string; name: string; description?: string; mimeType?: string }[] }
        error?: { message: string }
      }
      if (data.result?.resources) {
        setResources(data.result.resources)
        setError(null)
      } else {
        setError(data.error?.message ?? 'Could not load resources')
      }
    } catch {
      setError('Could not reach the MCP server')
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await load()
    }
    void run()
    const onFocus = () => void run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const readSnippet = `curl -X POST ${origin}/api/mcp \\
  -H "Authorization: Bearer acme_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read",
       "params":{"uri":"acme://channels/general"}}'`

  const templateSnippet = `curl -X POST ${origin}/api/mcp \\
  -H "Authorization: Bearer acme_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read",
       "params":{"uri":"acme://channels/engineering/messages?limit=10"}}'`

  return (
    <section aria-labelledby="resources-heading" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600/15 text-teal-600 dark:text-teal-400">
          <Layers className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="resources-heading" className="text-sm font-bold">
            Resources
          </h2>
          <p className="text-xs text-muted-foreground">
            Read-only channel context — every channel you can read is exposed as a resource MCP
            clients can browse and attach.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto h-5 shrink-0 px-1.5 text-[10px]">
          {resources ? `${resources.length} resources` : '…'}
        </Badge>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      ) : resources === null ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {resources.slice(0, 6).map((r) => (
              <div
                key={r.uri}
                className="flex items-start gap-2.5 rounded-xl border border-border p-3 transition-colors duration-150 hover:border-teal-500/40"
              >
                <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold">{r.name}</p>
                    <code className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {r.mimeType ?? 'application/json'}
                    </code>
                  </div>
                  <code className="mt-1 block truncate font-mono text-[10px] text-teal-700 dark:text-teal-300">
                    {r.uri}
                  </code>
                  {r.description && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{r.description}</p>
                  )}
                </div>
              </div>
            ))}
            {resources.length > 6 && (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                +{resources.length - 6} more — list them via resources/list
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              Reading a resource returns the channel&apos;s latest 50 messages as JSON — perfect
              context for “catch me up” style prompts in Claude Desktop or Cursor. Requires the{' '}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">channels:read</code> scope.
            </p>
            <CodeBlock code={readSnippet} language="bash" highlight />
          </div>
          <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
              <Sparkles className="h-3 w-3" aria-hidden /> Resource templates — parameterized reads
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono text-[10px]">resources/templates/list</code>{' '}
              exposes one URI template so clients can request any channel with a size that fits their
              context window:{' '}
              <code className="rounded bg-muted px-1 font-mono text-[10px] text-teal-700 dark:text-teal-300">
                acme://channels/{'{slug}'}/messages?limit=N
              </code>{' '}
              (N between 1 and 200, default 50).
            </p>
            <CodeBlock code={templateSnippet} language="bash" highlight />
          </div>
        </div>
      )}
    </section>
  )
}

/** MCP prompts — reusable instruction templates AI clients fill and run. */
interface PromptInfo {
  name: string
  description: string
  arguments: { name: string; description: string; required?: boolean }[]
}

function PromptsSection({ origin }: { origin: string }) {
  const [prompts, setPrompts] = useState<PromptInfo[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'prompts/list' }),
      })
      const data = (await res.json()) as {
        result?: { prompts?: PromptInfo[] }
        error?: { message: string }
      }
      if (data.result?.prompts) setPrompts(data.result.prompts)
    } catch {
      // section stays collapsed
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await load()
    }
    void run()
    const onFocus = () => void run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const getSnippet = `curl -X POST ${origin}/api/mcp \\
  -H "Authorization: Bearer acme_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"prompts/get",
       "params":{"name":"catch_up",
                 "arguments":{"channel":"engineering","hours":"24"}}}'`

  return (
    <section aria-labelledby="prompts-heading" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15 text-violet-600 dark:text-violet-400">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="prompts-heading" className="text-sm font-bold">
            Prompts
          </h2>
          <p className="text-xs text-muted-foreground">
            Ready-made instruction templates — a client fills the arguments, runs the rendered
            prompt with the tools above, and posts the result back.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto h-5 shrink-0 px-1.5 text-[10px]">
          {prompts ? `${prompts.length} prompts` : '…'}
        </Badge>
      </div>

      {prompts === null ? (
        <div className="grid gap-2 md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            {prompts.map((p) => (
              <div
                key={p.name}
                className="flex flex-col rounded-xl border border-border p-3 transition-colors duration-150 hover:border-violet-500/40"
              >
                <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-violet-700 dark:text-violet-300">
                  <Terminal className="h-3 w-3 shrink-0" aria-hidden />
                  {p.name}
                </p>
                <p className="mt-1.5 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.arguments.map((arg) => (
                    <span
                      key={arg.name}
                      className={cn(
                        'rounded bg-muted px-1.5 py-px font-mono text-[9px]',
                        arg.required ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                      )}
                      title={arg.description}
                    >
                      {arg.name}
                      {arg.required ? '*' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono text-[10px]">prompts/get</code>{' '}
              renders a template with your arguments into a ready-to-run user message. In Claude
              Desktop, prompts appear in the slash-command menu.
            </p>
            <CodeBlock code={getSnippet} language="bash" highlight />
          </div>
        </div>
      )}
    </section>
  )
}

export function IntegrationsView() {
  const setView = useViewStore((s) => s.setView)
  // The browsing origin is a client-only constant — read it via
  // useSyncExternalStore (no setState-in-effect, no hydration mismatch).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
  const [tools, setTools] = useState<McpToolInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Fetch the tool catalog from the MCP server itself — the view dogfoods
  // its own endpoint (tools/list via session cookie).
  const loadTools = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      })
      const data = (await res.json()) as { result?: { tools?: McpToolInfo[] }; error?: { message: string } }
      if (data.result?.tools) {
        setTools(data.result.tools)
        setLoadError(null)
      } else {
        setLoadError(data.error?.message ?? 'Could not load tools')
      }
    } catch {
      setLoadError('Could not reach the MCP server')
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      await loadTools()
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadTools])

  const endpoint = `${origin}/api/mcp`

  const curlSnippet = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer acme_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`

  const claudeSnippet = `// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "acme-chat": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer acme_YOUR_KEY" }
    }
  }
}`

  const cursorSnippet = `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "acme-chat": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer acme_YOUR_KEY" }
    }
  }
}`

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('chat')}
          className="h-8 shrink-0 rounded-lg px-2 text-muted-foreground"
          aria-label="Back to chat"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Chat</span>
        </Button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
          <Plug className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">Integrations</h1>
          <p className="truncate text-xs text-muted-foreground">
            MCP server + Slack-compatible bot API — connect AI clients and existing Slack bots.
          </p>
        </div>
        <ServerStatus />
      </header>

      {/* scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-6">
          {/* 1 ─ endpoint overview */}
          <section aria-labelledby="mcp-heading" className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
                <Cable className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 id="mcp-heading" className="text-sm font-bold">
                  MCP server endpoint
                </h2>
                <p className="text-xs text-muted-foreground">
                  JSON-RPC 2.0 over HTTP · protocol 2025-03-26 · {tools ? tools.length : '…'} tools
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-gradient-to-br from-muted/50 to-transparent p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs shadow-inner">
                  {origin ? endpoint : '…'}
                </code>
                <CopyButton text={endpoint} label="Copy endpoint" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">initialize</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">tools/list</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">tools/call</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">resources/list</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">resources/read</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">resources/templates/list</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">prompts/list</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">prompts/get</Badge>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">ping</Badge>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Bearer auth</Badge>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Every tool call runs with the identity of the key owner and goes through the same
                pipeline as messages typed in the app — mentions notify, AI agents reply, workflows
                fire. That’s the point: <strong className="text-foreground">agents and humans share one API.</strong>
              </p>
            </div>

            {/* connection recipes */}
            <div className="grid gap-3 lg:grid-cols-3">
              <ConnectionCard
                icon={<Terminal className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />}
                title="curl — try it now"
                blurb="Raw JSON-RPC over HTTP. Start with tools/list, then tools/call."
                code={curlSnippet}
                language="bash"
              />
              <ConnectionCard
                icon={<Command className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />}
                title="Claude Desktop"
                blurb="Add the server to claude_desktop_config.json, restart Claude."
                code={claudeSnippet}
                language="json"
              />
              <ConnectionCard
                icon={<ChevronDown className="h-5 w-5 rotate-[-45deg] text-sky-600 dark:text-sky-400" aria-hidden />}
                title="Cursor"
                blurb="Add to ~/.cursor/mcp.json — tools appear in Cursor’s agent."
                code={cursorSnippet}
                language="json"
              />
            </div>
          </section>

          {/* 2 ─ Slack bot API compatibility */}
          <SlackApiSection origin={origin} />

          {/* 3 ─ API keys */}
          <ApiKeysSection />

          {/* 4 ─ playground */}
          {tools ? (
            <ToolPlayground tools={tools} />
          ) : loadError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-xs text-destructive">
              {loadError}
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48 rounded-lg" />
              <div className="grid gap-3 lg:grid-cols-2">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </div>
          )}

          {/* 5 ─ resources */}
          <ResourcesSection origin={origin} />

          {/* 6 ─ prompts */}
          <PromptsSection origin={origin} />

          {/* 7 ─ tool reference */}
          {tools && <ToolReference tools={tools} />}
        </div>
      </div>
    </div>
  )
}
