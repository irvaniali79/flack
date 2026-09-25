'use client'
// Markdown renderer: emoji shortcodes, @mentions, #channel refs, code blocks
// with syntax highlighting + copy, mention chips and styled blocks.
import { isValidElement, memo, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTheme } from 'next-themes'
import { Check, Copy, ExternalLink, Sparkles } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { colonToEmoji } from './emoji'
import type { ChannelDTO, UserDTO } from './types'
import { cn } from './utils'

// ─── preprocessing ───────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildMentionMap(users: UserDTO[]): Map<string, UserDTO> {
  const map = new Map<string, UserDTO>()
  for (const user of users) {
    map.set(normalize(user.name), user)
    const firstWord = user.name.trim().split(/\s+/)[0]
    if (firstWord && !map.has(normalize(firstWord))) map.set(normalize(firstWord), user)
    if (user.handle && !map.has(normalize(user.handle))) map.set(normalize(user.handle), user)
  }
  return map
}

function buildChannelMap(channels: ChannelDTO[]): Map<string, ChannelDTO> {
  const map = new Map<string, ChannelDTO>()
  for (const channel of channels) {
    if (channel.kind === 'dm' || channel.kind === 'group_dm') continue
    map.set(normalize(channel.slug), channel)
    map.set(normalize(channel.name), channel)
  }
  return map
}

/** Split text into code / non-code segments so transforms skip code. */
function splitCodeSegments(text: string): Array<{ code: boolean; value: string }> {
  const segments: Array<{ code: boolean; value: string }> = []
  const fence = /```[\s\S]*?(?:```|$)/g
  const inline = /`[^`\n]*`/g
  let last = 0
  const ranges: Array<[number, number]> = []
  for (const match of text.matchAll(fence)) ranges.push([match.index!, match.index! + match[0].length])
  for (const match of text.matchAll(inline)) {
    const start = match.index!
    const end = start + match[0].length
    if (!ranges.some(([rs, re]) => start >= rs && start < re)) ranges.push([start, end])
  }
  ranges.sort((a, b) => a[0] - b[0])
  for (const [start, end] of ranges) {
    if (start > last) segments.push({ code: false, value: text.slice(last, start) })
    segments.push({ code: true, value: text.slice(start, end) })
    last = end
  }
  if (last < text.length) segments.push({ code: false, value: text.slice(last) })
  return segments
}

function transformSegment(
  text: string,
  mentionMap: Map<string, UserDTO>,
  channelMap: Map<string, ChannelDTO>,
): string {
  let out = colonToEmoji(text)

  // @mentions → markdown links; @channel/@here → special chips
  out = out.replace(/@([a-zA-Z0-9_]+)/g, (match, token: string) => {
    const lower = token.toLowerCase()
    if (lower === 'channel' || lower === 'here') {
      return `[@${lower}](#mention-special)`
    }
    const user = mentionMap.get(normalize(token))
    if (user) return `[@${user.name}](#mention-${user.id})`
    return match
  })

  // #channel refs → markdown links (skip markdown headings — require non-# boundary)
  out = out.replace(/(^|[\s(])#([a-z0-9][a-z0-9-]{0,60})/gi, (match, prefix: string, name: string) => {
    const channel = channelMap.get(normalize(name))
    if (channel) return `${prefix}[#${channel.slug}](#channel-${channel.id})`
    return match
  })

  return out
}

export function preprocessBody(
  body: string,
  users: UserDTO[],
  channels: ChannelDTO[],
): string {
  const mentionMap = buildMentionMap(users)
  const channelMap = buildChannelMap(channels)
  return splitCodeSegments(body)
    .map((segment) => (segment.code ? segment.value : transformSegment(segment.value, mentionMap, channelMap)))
    .join('')
}

// ─── code block ──────────────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  const { resolvedTheme } = useTheme()
  const [copied, setCopied] = useState(false)
  const style = resolvedTheme === 'light' ? oneLight : oneDark

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-border bg-zinc-950 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={style}
        customStyle={{
          margin: 0,
          padding: '0.75rem',
          background: 'transparent',
          fontSize: '0.8125rem',
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-geist-mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// ─── mention chips & links ───────────────────────────────────────────────────

function MentionChip({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const store = useMarkdownContext()
  const isSpecial = href === '#mention-special'
  const userId = href.replace('#mention-', '')
  const user = store.usersById.get(userId)

  const content = (
    <>
      {user?.kind === 'agent' && <Sparkles className="mr-0.5 inline h-3 w-3 shrink-0" aria-hidden />}
      {children}
    </>
  )

  const className = isSpecial
    ? 'mx-px inline-flex items-center rounded px-1 py-px font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors'
    : 'mx-px inline-flex items-center rounded px-1 py-px font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors'

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault()
        const target = isSpecial ? null : store.usersById.get(userId)
        if (target) store.onOpenProfile?.(target.id)
      }}
    >
      {content}
    </button>
  )
}

function ChannelRef({ href, children }: { href: string; children: ReactNode }) {
  const store = useMarkdownContext()
  const channelId = href.replace('#channel-', '')
  return (
    <button
      type="button"
      className="mx-px rounded px-1 py-px font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 transition-colors"
      onClick={(event) => {
        event.preventDefault()
        store.onOpenChannel?.(channelId)
      }}
    >
      {children}
    </button>
  )
}

// ─── context ─────────────────────────────────────────────────────────────────

import { createContext, useContext } from 'react'

interface MarkdownContextValue {
  usersById: Map<string, UserDTO>
  onOpenProfile?: (userId: string) => void
  onOpenChannel?: (channelId: string) => void
}

const MarkdownContext = createContext<MarkdownContextValue>({ usersById: new Map() })

function useMarkdownContext() {
  return useContext(MarkdownContext)
}

// ─── main renderer ───────────────────────────────────────────────────────────

export interface MarkdownBodyProps {
  body: string
  users: UserDTO[]
  channels: ChannelDTO[]
  onOpenProfile?: (userId: string) => void
  onOpenChannel?: (channelId: string) => void
  className?: string
}

export const MarkdownBody = memo(function MarkdownBody({
  body,
  users,
  channels,
  onOpenProfile,
  onOpenChannel,
  className,
}: MarkdownBodyProps) {
  const processed = useMemo(() => preprocessBody(body, users, channels), [body, users, channels])
  const contextValue = useMemo<MarkdownContextValue>(
    () => ({ usersById: new Map(users.map((u) => [u.id, u])), onOpenProfile, onOpenChannel }),
    [users, onOpenProfile, onOpenChannel],
  )

  return (
    <MarkdownContext.Provider value={contextValue}>
      <div className={cn('markdown-body break-words text-[15px] leading-relaxed', className)}>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-0.5 whitespace-pre-wrap last:mb-0">{children}</p>,
            a: ({ href, children }) => {
              const link = href ?? ''
              if (link.startsWith('#mention-')) return <MentionChip href={link}>{children}</MentionChip>
              if (link.startsWith('#channel-')) return <ChannelRef href={link}>{children}</ChannelRef>
              return (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-0.5 font-medium text-emerald-700 underline decoration-emerald-700/40 underline-offset-2 hover:decoration-emerald-600 dark:text-emerald-400 dark:decoration-emerald-400/40"
                >
                  {children}
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                </a>
              )
            },
            code: ({ children, className }) => {
              const text = String(children ?? '')
              // block code is handled by `pre` — render inline style here
              if (className?.includes('language-')) {
                return <code className={cn('font-mono text-[13px]', className)}>{children}</code>
              }
              return (
                <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[13px] text-zinc-800 dark:bg-zinc-700/60 dark:text-zinc-200">
                  {text}
                </code>
              )
            },
            pre: ({ children }) => {
              // extract text + language from the inner <code> element
              let code = ''
              let language = ''
              if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
                language = /language-(\w+)/.exec(children.props.className ?? '')?.[1] ?? ''
                code = extractText(children.props.children)
              } else {
                code = extractText(children)
              }
              return <CodeBlock language={language} code={code} />
            },
            blockquote: ({ children }) => (
              <blockquote className="my-1.5 border-l-[3px] border-primary/40 pl-3 text-foreground/80">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
            ),
            li: ({ children }) => <li className="pl-0.5">{children}</li>,
            h1: ({ children }) => (
              <h1 className="mb-1 mt-2 text-lg font-bold">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-1 mt-2 text-base font-bold">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-1 mt-1.5 text-[15px] font-semibold">{children}</h3>
            ),
            hr: () => <hr className="my-2 border-border" />,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            table: ({ children }) => (
              <div className="my-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border-b border-border bg-muted/60 px-3 py-1.5 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-border px-3 py-1.5 last:border-b-0">{children}</td>
            ),
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    </MarkdownContext.Provider>
  )
})

function extractText(node: ReactNode): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children)
  return ''
}
