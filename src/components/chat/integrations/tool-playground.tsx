'use client'
// Tool playground — call the MCP server's tools right from the app (session
// auth), with a JSON args editor, syntax-highlighted responses and a run
// history. This doubles as live documentation of what external AI clients see.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  Eye,
  Hash,
  History,
  Loader2,
  MessagesSquare,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Smile,
  Terminal,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useChatStore } from '@/lib/store'
import type { McpToolInfo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CodeBlock } from './code-block'

type ToolIcon = typeof Send

const TOOL_ICONS: Record<string, ToolIcon> = {
  post_message: Send,
  read_channel: Eye,
  search_messages: Search,
  list_channels: Hash,
  get_thread: MessagesSquare,
  add_reaction: Smile,
  create_channel: Plus,
}

type PlaygroundResult = {
  id: number
  tool: string
  args: string
  response: string
  isError: boolean
  latencyMs: number
  at: number
}

let rpcId = 100

export function ToolPlayground({ tools }: { tools: McpToolInfo[] }) {
  const channels = useChatStore((s) => s.channels)
  const [selected, setSelected] = useState<string>(tools[0]?.name ?? '')
  const [argsText, setArgsText] = useState('{}')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<PlaygroundResult[]>([])
  const [activeResultId, setActiveResultId] = useState<number | null>(null)
  const argsRef = useRef<HTMLTextAreaElement | null>(null)

  const tool = useMemo(() => tools.find((t) => t.name === selected), [tools, selected])
  const activeResult = results.find((r) => r.id === activeResultId) ?? null

  // Seed sensible default args whenever the selected tool changes
  const seedArgs = useCallback(
    (toolName: string) => {
      const firstPublic = channels.find((c) => c.kind === 'public' && c.isMember)
      const channelRef = firstPublic ? `#${firstPublic.name}` : '#general'
      switch (toolName) {
        case 'post_message':
          return JSON.stringify(
            { channel: channelRef, text: 'Hello from the MCP tool playground 👋' },
            null,
            2,
          )
        case 'read_channel':
          return JSON.stringify({ channel: channelRef, limit: 10 }, null, 2)
        case 'search_messages':
          return JSON.stringify({ query: 'launch', count: 5 }, null, 2)
        case 'list_channels':
          return JSON.stringify({}, null, 2)
        case 'get_thread':
          // Seed with the most recent channel message that started a thread
          return JSON.stringify(
            {
              thread_ts: 'paste a message id (try read_channel first — ids are the ts values)',
            },
            null,
            2,
          )
        case 'add_reaction':
          return JSON.stringify({ channel: channelRef, ts: 'paste a message id', emoji: 'tada' }, null, 2)
        case 'create_channel':
          return JSON.stringify(
            { name: 'ai-landing-zone', topic: 'Scratch space for AI-driven experiments', private: false },
            null,
            2,
          )
        default:
          return JSON.stringify({}, null, 2)
      }
    },
    [channels],
  )

  useEffect(() => {
    setArgsText(seedArgs(selected))
  }, [selected, seedArgs])

  // Validate the args editor on every keystroke — cheap and helpful
  const parsedArgs = useMemo(() => {
    try {
      const value = JSON.parse(argsText)
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false as const, error: 'Arguments must be a JSON object' }
      }
      return { ok: true as const, value: value as Record<string, unknown> }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Invalid JSON' }
    }
  }, [argsText])

  const run = async () => {
    if (running || !tool || !parsedArgs.ok) return
    setRunning(true)
    const startedAt = performance.now()
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++rpcId,
          method: 'tools/call',
          params: { name: tool.name, arguments: parsedArgs.value },
        }),
      })
      const jsonrpc = (await res.json()) as {
        result?: { content?: { type: string; text: string }[]; isError?: boolean }
        error?: { message: string }
      }
      const latencyMs = Math.round(performance.now() - startedAt)
      let response: string
      let isError: boolean
      if (jsonrpc.error) {
        response = JSON.stringify(jsonrpc.error, null, 2)
        isError = true
      } else {
        const text = jsonrpc.result?.content?.find((c) => c.type === 'text')?.text ?? ''
        try {
          response = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          response = text
        }
        isError = jsonrpc.result?.isError ?? false
      }
      const entry: PlaygroundResult = {
        id: Date.now(),
        tool: tool.name,
        args: argsText,
        response,
        isError,
        latencyMs,
        at: Date.now(),
      }
      setResults((prev) => [entry, ...prev].slice(0, 12))
      setActiveResultId(entry.id)
    } catch (err) {
      const entry: PlaygroundResult = {
        id: Date.now(),
        tool: tool.name,
        args: argsText,
        response: JSON.stringify({ error: err instanceof Error ? err.message : 'Request failed' }, null, 2),
        isError: true,
        latencyMs: Math.round(performance.now() - startedAt),
        at: Date.now(),
      }
      setResults((prev) => [entry, ...prev].slice(0, 12))
      setActiveResultId(entry.id)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section aria-labelledby="playground-heading" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <Terminal className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 id="playground-heading" className="text-sm font-bold">
            Tool playground
          </h2>
          <p className="text-xs text-muted-foreground">
            Call tools exactly like an external AI client would — same endpoint, same auth, same
            results.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* left column — tool picker + args editor */}
        <div className="space-y-3">
          {/* tool catalog */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="MCP tools">
            {tools.map((t) => {
              const Icon = TOOL_ICONS[t.name] ?? Terminal
              const active = t.name === selected
              return (
                <button
                  key={t.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(t.name)}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all duration-150',
                    active
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm'
                      : 'border-border bg-background hover:border-emerald-500/30 hover:bg-accent/50 active:scale-[0.98]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[11px] font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground line-clamp-2">
                      {t.description.split('.')[0]}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* args editor */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                arguments · JSON
              </span>
              <button
                type="button"
                onClick={() => setArgsText(seedArgs(selected))}
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Reset arguments to defaults"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Reset
              </button>
            </div>
            <textarea
              ref={argsRef}
              className="h-40 w-full resize-y bg-background p-3 font-mono text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              spellCheck={false}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              aria-label="Tool arguments as JSON"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void run()
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
              <span
                className={cn(
                  'min-w-0 truncate text-[11px]',
                  parsedArgs.ok ? 'text-muted-foreground' : 'text-destructive',
                )}
                aria-live="polite"
              >
                {parsedArgs.ok ? 'Valid JSON' : parsedArgs.error}
              </span>
              <Button
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-lg font-semibold"
                onClick={run}
                disabled={running || !parsedArgs.ok}
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden />
                )}
                Run tool
              </Button>
            </div>
          </div>
        </div>

        {/* right column — response viewer + history */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                response
              </span>
              {activeResult && (
                <span className="flex items-center gap-2">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {activeResult.latencyMs} ms
                  </span>
                  {activeResult.isError ? (
                    <Badge variant="outline" className="h-5 gap-1 border-destructive/40 px-1.5 text-[10px] text-destructive">
                      <XCircle className="h-3 w-3" aria-hidden /> isError
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 gap-1 border-emerald-500/40 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" aria-hidden /> ok
                    </Badge>
                  )}
                </span>
              )}
            </div>
            {activeResult ? (
              <CodeBlock
                code={activeResult.response}
                language="result"
                highlight
                className="flex-1 rounded-none border-0 border-b-0"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
                <Terminal className="h-6 w-6 opacity-40" aria-hidden />
                <p>
                  Pick a tool, tweak the arguments and hit <strong className="text-foreground">Run tool</strong>{' '}
                  (or Ctrl/Cmd+Enter in the editor).
                </p>
              </div>
            )}
          </div>

          {/* run history */}
          {results.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-1.5">
                <History className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Run history
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">{results.length}/12</span>
              </div>
              <ul className="max-h-36 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setActiveResultId(r.id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors',
                        r.id === activeResultId ? 'bg-accent' : 'hover:bg-accent/50',
                      )}
                    >
                      {r.isError ? (
                        <XCircle className="h-3 w-3 shrink-0 text-destructive" aria-hidden />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
                      )}
                      <span className="shrink-0 font-mono font-medium">{r.tool}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{r.latencyMs} ms</span>
                      <span className="shrink-0 text-muted-foreground">{formatDistanceToNow(new Date(r.at), { addSuffix: true })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
