'use client'
// Custom emoji management (admin) — upload workspace emoji, see them live in
// the picker + messages + reactions. Uses :shortcode: everywhere, exactly
// like Slack.
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, CircleX, Loader2, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time'
import { useCustomEmojiStore, type CustomEmojiDTO } from '@/lib/custom-emoji'

const NAME_RE = /^[a-z0-9][a-z0-9_]{1,31}$/

export function CustomEmojiSection() {
  const customEmoji = useCustomEmojiStore((s) => s.emoji)
  const loaded = useCustomEmojiStore((s) => s.loaded)
  const refresh = useCustomEmojiStore((s) => s.refresh)

  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) refresh()
  }, [loaded, refresh])

  // revoke object URLs on change/unmount
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const pickFile = useCallback(
    (f: File | null) => {
      setError(null)
      if (!f) return
      const okTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
      if (!okTypes.includes(f.type)) {
        setError(`Unsupported type "${f.type || 'unknown'}" — use PNG, JPG, GIF, WebP or SVG`)
        return
      }
      if (f.size > 256 * 1024) {
        setError('Custom emoji must be ≤ 256 KB')
        return
      }
      setFile(f)
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(f))
      if (!name && NAME_RE.test(f.name.replace(/\.[^.]+$/, '').toLowerCase())) {
        setName(f.name.replace(/\.[^.]+$/, '').toLowerCase())
      }
    },
    [name, preview],
  )

  const upload = useCallback(async () => {
    if (!file || uploading) return
    if (!NAME_RE.test(name)) {
      setError('Shortcode: 2–32 lowercase letters, digits, underscores (e.g. "ship_it")')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('name', name)
      const res = await fetch('/api/admin/emoji', { method: 'POST', body: form })
      const data = (await res.json()) as { emoji?: CustomEmojiDTO; error?: string }
      if (!res.ok || !data.emoji) throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`)
      toast.success(`:${data.emoji.name}: added`, { description: 'Available in the emoji picker and as :shortcode: in messages.' })
      setFile(null)
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
      setPreview(null)
      setName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [file, name, uploading, preview, refresh])

  const remove = useCallback(
    async (entry: CustomEmojiDTO) => {
      if (busyId) return
      setBusyId(entry.id)
      try {
        const res = await fetch(`/api/admin/emoji/${entry.id}`, { method: 'DELETE' })
        const data = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Delete failed')
        toast.success(`:${entry.name}: removed`)
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setBusyId(null)
        setConfirmId(null)
      }
    },
    [busyId, refresh],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* upload form */}
      <div className="rounded-xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/5 via-card to-card p-4">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" aria-hidden />
          Add a workspace emoji
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Square images work best. Everyone can use it as <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">:shortcode:</code> in messages and reactions.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
          {/* dropzone / preview */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload emoji image"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
            className={cn(
              'flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
              dragging
                ? 'scale-105 border-fuchsia-500 bg-fuchsia-500/10'
                : 'border-border hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5',
            )}
          >
            {preview ? (
              <img src={preview} alt="Emoji preview" className="h-16 w-16 object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <UploadCloud className="h-5 w-5" aria-hidden />
                <span className="text-[10px] font-medium">drop or click</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2">
                <span className="select-none py-1.5 font-mono text-sm text-muted-foreground">:</span>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    setError(null)
                  }}
                  placeholder="ship_it"
                  maxLength={32}
                  className="h-8 w-36 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                  aria-label="Emoji shortcode"
                />
                <span className="select-none py-1.5 font-mono text-sm text-muted-foreground">:</span>
              </div>
              {file && (
                <Button
                  size="sm"
                  className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700"
                  onClick={() => void upload()}
                  disabled={uploading || !NAME_RE.test(name)}
                >
                  {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : <Plus className="mr-1 h-3 w-3" aria-hidden />}
                  Add emoji
                </Button>
              )}
              {file && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-xs"
                  onClick={() => {
                    setFile(null)
                    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
                    setPreview(null)
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'PNG, JPG, GIF, WebP or SVG · ≤ 256 KB'}
            </p>
            {name && NAME_RE.test(name) && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Preview in a message:
                <span className="rounded-md border border-border bg-background px-2 py-1 text-sm">
                  ship it {preview ? <img src={preview} alt={`:${name}:`} className="inline h-4 w-4 align-[-3px]" /> : '…'} nice
                </span>
              </p>
            )}
            {error && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                <CircleX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* gallery */}
      <div className="overflow-hidden rounded-xl border border-border">
        <p className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3.5 py-2.5 text-[13px] font-semibold">
          <span>
            Workspace emoji
            {loaded && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{customEmoji.length} total</span>}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">admin-managed · everyone can use</span>
        </p>
        {!loaded ? (
          <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6 lg:grid-cols-8">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : customEmoji.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium">No custom emoji yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload one above — or try the seeded ones if this is a fresh demo database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6 lg:grid-cols-8">
            {customEmoji.map((entry) => (
              <div
                key={entry.id}
                className="group relative flex aspect-square cursor-default flex-col items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 p-2 transition-all duration-150 hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5"
              >
                <img
                  src={entry.url}
                  alt={`:${entry.name}:`}
                  title={`:${entry.name}:`}
                  className="h-8 w-8 object-contain [image-rendering:pixelated]"
                  loading="lazy"
                />
                <span className="w-full truncate text-center font-mono text-[10px] text-muted-foreground">:{entry.name}:</span>
                <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  added {formatRelativeTime(entry.createdAt)}
                </span>
                {confirmId === entry.id ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-background/95 p-2">
                    <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Remove :{entry.name}:?</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 rounded-md bg-rose-600 px-2 text-[10px] hover:bg-rose-700"
                        onClick={() => void remove(entry)}
                        disabled={busyId === entry.id}
                      >
                        {busyId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : 'Remove'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 rounded-md px-2 text-[10px]" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remove :${entry.name}:`}
                    onClick={() => setConfirmId(entry.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* usage explainer */}
      <div className="rounded-xl border border-border bg-card/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          How custom emoji work
        </p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>Type <code className="rounded bg-muted px-1 font-mono text-[11px]">:shortcode:</code> in any message — it renders inline.</li>
          <li>Find them in the emoji picker under the <span aria-hidden>✨</span> tab, or by searching the shortcode.</li>
          <li>React with them too — reactions accept custom emoji.</li>
          <li>Built-in shortcodes win conflicts, and the uploader rejects shadowing names.</li>
        </ul>
      </div>
    </motion.div>
  )
}
