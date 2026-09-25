'use client'
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Array<[RegExp, LucideIcon]> = [
  [/^video\//, FileVideo],
  [/^audio\//, FileAudio],
  [/(zip|tar|gzip|compress|archive)/, FileArchive],
  [/(json|javascript|typescript|xml|html|css|python|java|shell|yaml|toml|code)/, FileCode],
  [/(spreadsheet|excel|csv)/, FileSpreadsheet],
  [/(pdf|msword|text\/|word|presentation|powerpoint)/, FileText],
]

export function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  for (const [pattern, Icon] of ICONS) {
    if (pattern.test(mimeType)) return <Icon className={cn('h-5 w-5', className)} aria-hidden />
  }
  return <File className={cn('h-5 w-5', className)} aria-hidden />
}
