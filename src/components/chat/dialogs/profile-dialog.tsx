'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AtSign, Camera, Clock, ImagePlus, Loader2, Mail, Pencil, Sparkles, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { uploadFile } from '@/lib/api'
import { localTimeIn, localTimezoneLabel } from '@/lib/time'
import { UserAvatar } from '../avatar'
import { PresenceDot } from '../presence-dot'
import { AppBadge } from '../connectors/connector-icon'

const STATUS_EMOJIS = ['🎯', '☕', '🎨', '🚀', '🌴', '🧠', '🎧', '🏗️', '📋', '🔬', '💤', '🤖', '🔥', '🌱', '✈️', '🦁', '', '😀']

const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const MAX_PHOTO_MB = 10

export function ProfileDialog() {
  const profileUserId = useChatStore((s) => s.profileUserId)
  const setProfileUserId = useChatStore((s) => s.setProfileUserId)
  const me = useChatStore((s) => s.me)
  const users = useChatStore((s) => s.users)
  const presence = useChatStore((s) => s.presence)
  const createDm = useChatStore((s) => s.createDm)
  const updateMe = useChatStore((s) => s.updateMe)

  const user = useMemo(() => users.find((u) => u.id === profileUserId) ?? null, [users, profileUserId])
  const isSelf = !!user && user.id === me?.id

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [statusEmoji, setStatusEmoji] = useState('')
  const [statusText, setStatusText] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [busy, setBusy] = useState(false)

  // Photos: uploaded immediately (via /api/files) but only SAVED to the profile
  // on "Save changes" — so cancel is a true undo.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditing(false)
    if (user) {
      setName(user.name)
      setTitle(user.title ?? '')
      setStatusEmoji(user.statusEmoji ?? '')
      setStatusText(user.statusText ?? '')
      setTimezone(user.id === me?.id ? (me?.timezone ?? 'UTC') : (user.timezone ?? 'UTC'))
      setAvatarUrl(user.avatarUrl ?? null)
      setBannerUrl(user.bannerUrl ?? null)
    }
  }, [profileUserId, user, me])

  if (!user) return null

  const open = !!profileUserId

  const save = async () => {
    setBusy(true)
    try {
      await updateMe({
        name: name.trim() || undefined,
        title: title.trim() || null,
        statusEmoji: statusEmoji || null,
        statusText: statusText.trim() || null,
        timezone,
        avatarUrl,
        bannerUrl,
      })
      toast.success('Profile updated')
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setBusy(false)
    }
  }

  /** Upload an image picked from disk; stores the returned URL in local state (saved on Save). */
  const pickPhoto = async (file: File | undefined, kind: 'avatar' | 'banner') => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, GIF…)')
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      toast.error(`Image is larger than ${MAX_PHOTO_MB} MB`)
      return
    }
    const setUploading = kind === 'avatar' ? setUploadingAvatar : setUploadingBanner
    setUploading(true)
    try {
      const uploaded = await uploadFile(file)
      if (kind === 'avatar') setAvatarUrl(uploaded.url)
      else setBannerUrl(uploaded.url)
      toast.success(kind === 'avatar' ? 'Photo added — Save to apply' : 'Cover photo added — Save to apply')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const myTimezone = editing ? timezone : (isSelf ? me?.timezone : user.timezone) || 'UTC'
  const displayEmoji = editing ? statusEmoji : (user.statusEmoji ?? '')
  const displayText = editing ? statusText : (user.statusText ?? '')
  const userTz = user.timezone || 'UTC'

  // What the dialog previews: local (unsaved) photo state while editing, the
  // stored profile otherwise.
  const previewUser = editing ? { ...user, avatarUrl, bannerUrl } : user
  const bannerSrc = editing ? bannerUrl : user.bannerUrl

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setProfileUserId(null)}>
      <DialogContent className="max-h-[calc(100dvh/var(--ui-scale)-2rem)] overflow-y-auto rounded-2xl p-0 sm:max-w-sm">
        {/* banner / cover photo */}
        {bannerSrc ? (
          <div className="relative h-28 w-full bg-muted">
            {/* runtime-uploaded image served by /api/files, not a build-time asset */}
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="h-28 w-full"
            style={{
              background: `linear-gradient(135deg, ${user.avatarColor}55 0%, transparent 60%), linear-gradient(225deg, #10b98144 0%, transparent 55%)`,
            }}
            aria-hidden
          />
        )}
        {isSelf && editing && (
          <div className="absolute inset-x-0 top-0 flex h-28 items-center justify-end gap-1.5 bg-gradient-to-l from-black/45 via-black/20 to-transparent p-2">
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0], 'banner')
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={uploadingBanner}
              className="h-7 gap-1.5 rounded-md bg-black/55 px-2.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm hover:bg-black/75"
              onClick={() => bannerInputRef.current?.click()}
            >
              {uploadingBanner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              )}
              {bannerUrl ? 'Change cover' : 'Add cover'}
            </Button>
            {bannerUrl && (
              <Button
                type="button"
                size="sm"
                aria-label="Remove cover photo"
                disabled={uploadingBanner}
                className="h-7 w-7 rounded-md bg-black/55 p-0 text-white shadow-sm backdrop-blur-sm hover:bg-rose-600"
                onClick={() => setBannerUrl(null)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        )}
        <div className="px-5 pb-5">
          <div className="-mt-10 mb-3 flex items-end justify-between">
            <div className="relative">
              <UserAvatar user={previewUser} size="xxl" className="ring-4 ring-background" />
              {isSelf && editing ? (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void pickPhoto(event.target.files?.[0], 'avatar')
                      event.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    aria-label={avatarUrl ? 'Change profile photo' : 'Upload profile photo'}
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-emerald-600 text-white shadow-md transition-colors duration-150 hover:bg-emerald-500 disabled:opacity-70"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      aria-label="Remove profile photo"
                      disabled={uploadingAvatar}
                      onClick={() => setAvatarUrl(null)}
                      className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-zinc-800 text-white shadow-md transition-colors duration-150 hover:bg-rose-600"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </>
              ) : (
                user.kind === 'human' && (
                  <PresenceDot online={presence[user.id]} className="absolute bottom-1 right-1 h-4 w-4" />
                )
              )}
            </div>
            {isSelf && !editing && (
              <Button
                variant="outline"
                size="sm"
                className="mb-1 gap-1.5 rounded-lg"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit profile
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3.5">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-base">Edit your profile</DialogTitle>
                <DialogDescription className="sr-only">Update your profile details</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-title">Title</Label>
                <Input
                  id="profile-title"
                  placeholder="e.g. Product Designer"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-1">
                  {STATUS_EMOJIS.map((emoji, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={emoji ? `Status ${emoji}` : 'Clear status emoji'}
                      onClick={() => setStatusEmoji(emoji)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border text-base transition-colors duration-150',
                        statusEmoji === emoji
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : 'border-transparent hover:bg-accent',
                      )}
                    >
                      {emoji || <span className="text-xs text-muted-foreground">none</span>}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="What are you working on?"
                  value={statusText}
                  onChange={(event) => setStatusText(event.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={myTimezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full rounded-lg">
                    <SelectValue placeholder="Pick timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 rounded-xl">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {localTimezoneLabel(tz)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void save()}
                  className="flex-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg leading-tight">
                  {user.name}
                  {user.kind === 'agent' && (
                    <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI Agent
                    </span>
                  )}
                  {user.kind === 'app' && <AppBadge />}
                  {user.role !== 'member' && (
                    <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase text-muted-foreground">
                      {user.role}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  {user.title ?? 'Team member'}
                </DialogDescription>
              </DialogHeader>

              {(displayEmoji || displayText) && (
                <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  {displayEmoji} {displayText}
                </p>
              )}

              <div className="mt-4 space-y-2 text-sm">
                {user.email && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{user.email}</span>
                  </p>
                )}
                {user.handle && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <AtSign className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{user.handle}</span>
                  </p>
                )}
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {localTimeIn(userTz)} · {userTz.replace('_', ' ')}
                </p>
              </div>

              {!isSelf && (
                <Button
                  className="mt-5 w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
                  onClick={() => {
                    setProfileUserId(null)
                    void createDm([user.id])
                  }}
                >
                  Message {user.name.split(' ')[0]}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
