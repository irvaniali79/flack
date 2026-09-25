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
import { useCustomEmojiStore, isCustomEmojiToken, type CustomEmojiDTO } from '@/lib/custom-emoji'

type PickerEmoji =
  | { kind: 'builtin'; char: string; title: string }
  | { kind: 'custom'; entry: CustomEmojiDTO; title: string }

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
  const customEmoji = useCustomEmojiStore((s) => s.emoji)

  const customMap = useMemo(() => new Map(customEmoji.map((e) => [e.name, e])), [customEmoji])

  const active: { id: string; name: string; emojis: PickerEmoji[] } = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      const builtins = searchEmojis(query).map(
        (e): PickerEmoji => ({ kind: 'builtin', char: e.char, title: `:${e.keywords[0]}:` }),
      )
      // custom emoji match on shortcode prefix
      const customs = customEmoji
        .filter((e) => e.name.includes(q))
        .map((e): PickerEmoji => ({ kind: 'custom', entry: e, title: `:${e.name}:` }))
      return { id: 'search', name: `Results for “${query.trim()}”`, emojis: [...customs, ...builtins] }
    }
    if (category === 'recent') {
      const emojis: PickerEmoji[] = []
      for (const token of recent) {
        if (isCustomEmojiToken(token)) {
          const entry = customMap.get(token.slice(1, -1))
          if (entry) emojis.push({ kind: 'custom', entry, title: `:${entry.name}:` })
        } else {
          const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis)
          const found = all.find((e) => e.char === token)
          if (found) emojis.push({ kind: 'builtin', char: found.char, title: `:${found.keywords[0]}:` })
        }
      }
      if (emojis.length > 0) return { id: 'recent', name: 'Recently used', emojis }
      // fall back to smileys when no recents yet
      const first = EMOJI_CATEGORIES[0]
      return {
        id: 'recent',
        name: 'Recently used',
        emojis: first.emojis.map((e): PickerEmoji => ({ kind: 'builtin', char: e.char, title: `:${e.keywords[0]}:` })),
      }
    }
    if (category === 'custom') {
      return {
        id: 'custom',
        name: 'Workspace emoji',
        emojis: customEmoji.map((e): PickerEmoji => ({ kind: 'custom', entry: e, title: `:${e.name}:` })),
      }
    }
    const cat = EMOJI_CATEGORIES.find((c) => c.id === category) ?? EMOJI_CATEGORIES[0]
    return {
      id: cat.id,
      name: cat.name,
      emojis: cat.emojis.map((e): PickerEmoji => ({ kind: 'builtin', char: e.char, title: `:${e.keywords[0]}:` })),
    }
  }, [query, category, recent, customEmoji, customMap])

  const pick = (value: string) => {
    pushRecentEmoji(value)
    setRecent(getRecentEmojis())
    onSelect(value)
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
          {customEmoji.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={category === 'custom'}
              title="Workspace emoji"
              onClick={() => setCategory('custom')}
              className={cn(
                'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-150',
                category === 'custom' ? 'bg-accent' : 'hover:bg-accent',
              )}
            >
              <span className="text-sm leading-none" aria-hidden>
                ✨
              </span>
              <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-fuchsia-500 px-0.5 text-[8px] font-bold text-white">
                {customEmoji.length}
              </span>
            </button>
          )}
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
            {active.emojis.map((emoji, index) =>
              emoji.kind === 'builtin' ? (
                <button
                  key={`${emoji.char}-${index}`}
                  type="button"
                  title={emoji.title}
                  onClick={() => pick(emoji.char)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-transform duration-100 hover:scale-125 hover:bg-accent"
                >
                  {emoji.char}
                </button>
              ) : (
                <button
                  key={`custom-${emoji.entry.id}`}
                  type="button"
                  title={emoji.title}
                  onClick={() => pick(`:${emoji.entry.name}:`)}
                  className="flex h-8 w-8 items-center justify-center rounded-md transition-transform duration-100 hover:scale-125 hover:bg-accent"
                >
                  <img
                    src={emoji.entry.url}
                    alt={emoji.title}
                    className="h-5 w-5 object-contain [image-rendering:pixelated]"
                    loading="lazy"
                  />
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
