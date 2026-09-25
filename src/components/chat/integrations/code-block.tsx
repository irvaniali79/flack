'use client'
// CodeBlock — dark, always-dark documentation-style code surface with a
// language tab and an animated copy button. Used across the Integrations view
// (connection snippets, curl examples, JSON responses).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard API can fail in insecure contexts — fallback below
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }, [text])

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] font-medium text-zinc-400',
        'transition-all duration-150 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200 active:scale-95',
        copied && 'border-emerald-400/40 text-emerald-400',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}

/** Minimal JSON syntax highlighting — keys emerald, strings amber, numbers/bools sky. */
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, str, colon, keyword, num) => {
      if (str && colon) return `<span class="text-emerald-300">${str}</span>${colon}`
      if (str) return `<span class="text-amber-200">${str}</span>`
      if (keyword) return `<span class="text-fuchsia-300">${keyword}</span>`
      if (num) return `<span class="text-sky-300">${num}</span>`
      return match
    },
  )
}

export function CodeBlock({
  code,
  language = 'json',
  maxHeight,
  className,
  highlight = false,
}: {
  code: string
  language?: string
  maxHeight?: number
  className?: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'group/code overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-inner',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/70 px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {language}
        </span>
        <CopyButton text={code} />
      </div>
      <pre
        className="overflow-auto p-3 text-[12px] leading-relaxed [overflow-wrap:break-word] whitespace-pre-wrap"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {highlight ? (
          <code
            className="font-mono text-zinc-300"
            dangerouslySetInnerHTML={{ __html: highlightJson(code) }}
          />
        ) : (
          <code className="font-mono text-zinc-300">{code}</code>
        )}
      </pre>
    </div>
  )
}
