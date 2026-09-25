'use client'
import { Download, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/lib/store'
import { formatBytes } from '@/lib/api'

export function ImageViewer() {
  const viewer = useChatStore((s) => s.imageViewer)
  const setImageViewer = useChatStore((s) => s.setImageViewer)

  return (
    <Dialog open={!!viewer} onOpenChange={(next) => !next && setImageViewer(null)}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-4xl"
      >
        {viewer && (
          <>
            <DialogTitle className="sr-only">{viewer.name}</DialogTitle>
            <DialogDescription className="sr-only">Image preview</DialogDescription>

            {/* image stage */}
            <div className="relative flex max-h-[74vh] items-center justify-center bg-zinc-950/95 p-3">
              <img
                src={viewer.url}
                alt={viewer.name}
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
              <DialogClose
                aria-label="Close image viewer"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-colors duration-150 hover:bg-black/70 hover:text-white"
              >
                <X className="h-4.5 w-4.5" aria-hidden />
              </DialogClose>
            </div>

            {/* footer */}
            <div className="flex items-center gap-3 border-t border-border bg-background px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{viewer.name}</p>
                {viewer.size != null && (
                  <p className="text-xs text-muted-foreground">{formatBytes(viewer.size)}</p>
                )}
              </div>
              <Button asChild className="h-9 shrink-0 gap-1.5 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500">
                <a href={viewer.url} download={viewer.name}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
