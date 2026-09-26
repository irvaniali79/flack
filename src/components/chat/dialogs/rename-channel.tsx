'use client'
// Rename-channel dialog — opened from the sidebar row right-click menu
// (Slack parity). PATCHes the channel name via the store; slug-ification,
// clash checks and the channels:refresh broadcast live server-side.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Hash, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/lib/store'
import type { ChannelDTO } from '@/lib/types'

export function RenameChannelDialog({
  channel,
  onOpenChange,
}: {
  channel: ChannelDTO | null
  onOpenChange: (open: boolean) => void
}) {
  const updateChannel = useChatStore((s) => s.updateChannel)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(channel?.name ?? '')
    setBusy(false)
  }, [channel])

  if (!channel) return null

  const clean = name.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')
  const changed = clean.length > 0 && clean !== channel.name

  const save = async () => {
    if (!changed || busy) return
    setBusy(true)
    try {
      await updateChannel(channel.id, { name: clean })
      toast.success(`Channel renamed to #${clean}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename the channel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!channel} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" aria-hidden />
            Rename {channel.kind === 'private' ? 'private channel' : 'channel'}
          </DialogTitle>
          <DialogDescription>
            Names are lowercase with no spaces — they become the channel link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <div className="flex items-center gap-0 rounded-lg border border-border bg-background px-2">
            <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
              maxLength={60}
              autoFocus
              aria-label="Channel name"
              className="h-9 border-0 bg-transparent px-1 focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {changed && <p className="px-1 text-[11px] text-muted-foreground">Will be #{clean}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-lg"
            onClick={() => void save()}
            disabled={!changed || busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
