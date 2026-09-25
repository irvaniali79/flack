'use client'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from '@/lib/emoji'

export function EmojiPicker({
  onSelect,
  className,
}: {
  onSelect: (char: string) => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(EMOJI_CATEGORIES[0].id)
  const [recent, setRecent] = useState<string[]>(() => getRecentEmojis())

  const active = useMemo(() => {
    if (query.trim()) {
      return { id: 'search', name: 'Results', icon: '🔍', emojis: searchEmojis(query) }
    }
    if (category === 'recent') {
      const recentSet = new Set(recent)
      const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis)
      const emojis = recent
        .map((char) => all.find((e) => e.char === char))
        .filter((e): e is NonNullable<typeof e> => !!e)
      if (emojis.length > 0) return { id: 'recent', name: 'Recently used', icon: '🕘', emojis }
      // fall back to smileys when no recents yet
      return { ...EMOJI_CATEGORIES[0], id: 'recent' }
    }
    return EMOJI_CATEGORIES.find((c) => c.id === category) ?? EMOJI_CATEGORIES[0]
  }, [query, category, recent])

  const pick = (char: string) => {
    pushRecentEmoji(char)
    setRecent(getRecentEmojis())
    onSelect(char)
  }

  return (
    <div className={cn('flex w-full flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji…"
          className="h-7 rounded-lg border-0 bg-muted/60 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500 dark:bg-muted/40"
        />
      </div>
      {!query.trim() && (
        <div
          className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-1.5 py-1"
          role="tablist"
          aria-label="Emoji categories"
        >
          <button
            type="button"
            role="tab"
            aria-selected={category === 'recent'}
            title="Recently used"
            onClick={() => setCategory('recent')}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm transition-colors duration-150',
              category === 'recent' ? 'bg-accent' : 'hover:bg-accent',
            )}
          >
            🕘
          </button>
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              title={cat.name}
              onClick={() => setCategory(cat.id)}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm transition-colors duration-150',
                category === cat.id ? 'bg-accent' : 'hover:bg-accent',
              )}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-64 min-h-40 overflow-y-auto p-2" role="grid" aria-label={active.name}>
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {query.trim() ? `Results for “${query.trim()}”` : active.name}
        </p>
        {active.emojis.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No emoji found</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {active.emojis.map((emoji, index) => (
              <button
                key={`${emoji.char}-${index}`}
                type="button"
                title={`:${emoji.keywords[0]}:`}
                onClick={() => pick(emoji.char)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-transform duration-100 hover:scale-125 hover:bg-accent"
              >
                {emoji.char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
