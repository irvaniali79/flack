'use client'
import { useMemo } from 'react'
import { Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'

interface ShortcutRow {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/** Detect Apple platforms once so the table shows ⌘ instead of Ctrl. */
function useIsMac(): boolean {
  return useMemo(
    () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent),
    [],
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5',
        'font-mono text-[11px] font-semibold text-foreground/80 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]',
        'dark:bg-zinc-800 dark:shadow-none',
      )}
    >
      {children}
    </kbd>
  )
}

function ShortcutRowView({ row }: { row: ShortcutRow }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-accent/60">
      <span className="min-w-0 text-[13px] text-foreground/85">{row.label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {row.keys.map((key, index) =>
          key === '+' ? (
            <span key={`plus-${index}`} className="text-[11px] text-muted-foreground" aria-hidden>
              +
            </span>
          ) : (
            <Kbd key={`${key}-${index}`}>{key}</Kbd>
          ),
        )}
      </span>
    </div>
  )
}

export function ShortcutsDialog() {
  const open = useChatStore((s) => s.shortcutsOpen)
  const setShortcutsOpen = useChatStore((s) => s.setShortcutsOpen)
  const isMac = useIsMac()
  const mod = isMac ? '⌘' : 'Ctrl'

  const groups: ShortcutGroup[] = [
    {
      title: 'General',
      rows: [
        { keys: [mod, 'K'], label: 'Open search' },
        { keys: [mod, '/'], label: 'Show keyboard shortcuts' },
        { keys: ['Esc'], label: 'Close panel or dialog' },
      ],
    },
    {
      title: 'Navigation',
      rows: [
        { keys: ['Alt', '↓'], label: 'Next channel' },
        { keys: ['Alt', '↑'], label: 'Previous channel' },
        { keys: ['Alt', '+', 'Shift', '↓'], label: 'Next unread channel' },
        { keys: ['Alt', '+', 'Shift', '↑'], label: 'Previous unread channel' },
      ],
    },
    {
      title: 'Messages',
      rows: [
        { keys: ['↑'], label: 'Edit your last message' },
        { keys: [mod, '↵'], label: 'Send message' },
      ],
    },
    {
      title: 'Composer',
      rows: [
        { keys: ['@'], label: 'Mention a teammate' },
        { keys: ['#'], label: 'Reference a channel' },
        { keys: [':'], label: 'Emoji shortcode (e.g. :tada:)' },
        { keys: ['/'], label: 'Slash commands' },
      ],
    },
  ]

  return (
    <Dialog open={open} onOpenChange={setShortcutsOpen}>
      <DialogContent className="top-[12%] max-h-[80vh] translate-y-0 gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
              <Keyboard className="h-4.5 w-4.5" aria-hidden />
            </span>
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Move faster with the keyboard — {isMac ? '⌘ stands for Command' : 'use Ctrl on Windows and Linux'}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-px">
                {group.rows.map((row) => (
                  <ShortcutRowView key={row.label} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
