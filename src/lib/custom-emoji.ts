'use client'
// Custom emoji client store — fetched once per session (plus on demand after
// admin changes). Shared by the markdown renderer (message bodies), the emoji
// picker (Custom category) and reaction rendering.
import { create } from 'zustand'

export interface CustomEmojiDTO {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
  createdAt: string
}

interface CustomEmojiStore {
  emoji: CustomEmojiDTO[]
  byName: Map<string, CustomEmojiDTO>
  loaded: boolean
  fetchCustomEmoji: () => Promise<void>
  refresh: () => void
}

let inflight: Promise<void> | null = null

export const useCustomEmojiStore = create<CustomEmojiStore>((set, get) => ({
  emoji: [],
  byName: new Map(),
  loaded: false,

  fetchCustomEmoji: async () => {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const res = await fetch('/api/emoji')
        if (!res.ok) return
        const data = (await res.json()) as { emoji?: CustomEmojiDTO[] }
        const emoji = data.emoji ?? []
        set({
          emoji,
          byName: new Map(emoji.map((e) => [e.name, e])),
          loaded: true,
        })
      } catch {
        // non-critical — messages still render, just without custom emoji
      } finally {
        inflight = null
      }
    })()
    return inflight
  },

  refresh: () => {
    // bust the inflight guard and refetch (used after admin upload/delete)
    inflight = null
    void get().fetchCustomEmoji()
  },
}))

/** True when the string looks like a custom-emoji shortcode token (`:name:`). */
export function isCustomEmojiToken(emoji: string): boolean {
  return emoji.length > 2 && emoji.startsWith(':') && emoji.endsWith(':') && /^:[a-z0-9_]+:$/i.test(emoji)
}

/** Extract the bare shortcode from a `:name:` token. */
export function customEmojiName(emoji: string): string {
  return emoji.slice(1, -1).toLowerCase()
}
