'use client'
// Tiny separate view store for main-area routing (chat / workflows / admin).
// Kept separate from src/lib/store.ts on purpose — do not merge.
import { create } from 'zustand'

export type MainView =
  | 'chat'
  | 'threads'
  | 'workflows'
  | 'admin'
  | 'saved'
  | 'integrations'
  | 'connectors'

interface ViewStore {
  view: MainView
  setView: (view: MainView) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  view: 'chat',
  setView: (view) => set({ view }),
}))
