'use client'
// Integrations view — the developer surface for the platform's key
// differentiators: a Model Context Protocol server and a Slack-compatible
// Web API. Four sections:
//   1. MCP endpoint overview + connection snippets (curl / Claude / Cursor)
//   2. Slack bot API compatibility (zero-code bot migration)
//   3. API key management (Bearer auth for external clients)
//   4. Tool playground (call tools live, exactly as an AI client would)
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  Cable,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  Command,
  Loader2,
  Plug,
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

          {/* 5 ─ tool reference */}
          {tools && <ToolReference tools={tools} />}
        </div>
      </div>
    </div>
  )
}
