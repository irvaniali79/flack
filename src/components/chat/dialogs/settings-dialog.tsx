'use client'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { BellOff, Check, Clock, Hash, Mail, MoonStar, Monitor, Moon, ShieldCheck, Smile, Sun, Type } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/lib/store'
import { ACCENT_THEMES, DEFAULT_ACCENT } from '@/lib/theme-options'
import { localTimezoneLabel } from '@/lib/time'
import { formatHHmm, isQuietHours, quietUntilLabel } from '@/lib/dnd'
import { UserAvatar } from '../avatar'
import { EmojiPicker } from '../emoji-picker'
import { SecurityTab } from './security-tab'
import { EmailNotifSection } from './email-notif-section'

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

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'Bright and crisp', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'System', description: 'Match your device', icon: Monitor },
] as const

// Per-user display zoom presets (multiplier applied to the whole UI).
// Mirrors Slack's “Zoom” display setting — saved to the profile so the
// preferred size follows the user across devices.
const FONT_SIZE_OPTIONS = [
  { value: 0.85, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
  { value: 1.45, label: 'Huge' },
] as const

export function SettingsDialog() {
  const open = useChatStore((s) => s.settingsOpen)
  const setOpen = useChatStore((s) => s.setSettingsOpen)
  const me = useChatStore((s) => s.me)
  const updateMe = useChatStore((s) => s.updateMe)
  const setAccentTheme = useChatStore((s) => s.setAccentTheme)
  const setFontSize = useChatStore((s) => s.setFontSize)
  const { theme, setTheme } = useTheme()

  // ── profile form (reset when the dialog is (re)opened) ─────────────────────
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [statusEmoji, setStatusEmoji] = useState('')
  const [statusText, setStatusText] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [busy, setBusy] = useState(false)
  const [dndBusy, setDndBusy] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [dndStart, setDndStart] = useState('')
  const [dndEnd, setDndEnd] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open && me) {
      setName(me.name)
      setTitle(me.title ?? '')
      setStatusEmoji(me.statusEmoji ?? '')
      setStatusText(me.statusText ?? '')
      setTimezone(me.timezone ?? 'UTC')
      setDndStart(me.dndStart ?? '')
      setDndEnd(me.dndEnd ?? '')
    }
  }

  if (!me) return null

  const activeTheme = theme ?? 'dark'
  const activeAccent = me.accentTheme ?? DEFAULT_ACCENT
  const activeFontSize = me.fontSize ?? 1

  const saveProfile = async () => {
    if (busy) return
    setBusy(true)
    try {
      await updateMe({
        name: name.trim() || me.name,
        title: title.trim() || null,
        statusEmoji: statusEmoji || null,
        statusText: statusText.trim() || null,
        timezone,
      })
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setBusy(false)
    }
  }

  const toggleDnd = async (next: boolean) => {
    if (dndBusy) return
    setDndBusy(true)
    try {
      await updateMe({ dndEnabled: next })
      toast.success(next ? 'Do Not Disturb is on' : 'Do Not Disturb is off')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update preference')
    } finally {
      setDndBusy(false)
    }
  }

  const saveQuietSchedule = async (start: string, end: string) => {
    if (dndBusy) return
    setDndBusy(true)
    try {
      await updateMe({
        dndStart: start || null,
        dndEnd: end || null,
        // Turning on a schedule implies enabling DND for the window
        ...(start && end && !me?.dndEnabled ? { dndEnabled: true } : {}),
      })
      toast.success(
        start && end
          ? `Quiet hours scheduled — ${formatHHmm(start)} to ${formatHHmm(end)}`
          : 'Quiet-hours schedule cleared (all-day DND while on)',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save schedule')
    } finally {
      setDndBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile, notifications and appearance.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile">
          <div className="px-5 pt-3">
            <TabsList className="grid w-full grid-cols-4 rounded-xl">
              <TabsTrigger value="profile" className="rounded-lg px-1 text-[11px] sm:text-xs">Profile</TabsTrigger>
              <TabsTrigger value="notifications" className="rounded-lg px-1 text-[11px] sm:text-xs">Alerts</TabsTrigger>
              <TabsTrigger value="security" className="rounded-lg px-1 text-[11px] sm:text-xs">
                <span className="flex items-center gap-1">
                  Security
                  {me.totpEnabled && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                      aria-label="Two-factor authentication is on"
                      title="Two-factor authentication is on"
                    />
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="rounded-lg px-1 text-[11px] sm:text-xs">Theme</TabsTrigger>
            </TabsList>
          </div>

          {/* ── Profile ──────────────────────────────────────────────────────── */}
          <TabsContent value="profile" className="mt-4 space-y-4 px-5 pb-5">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <UserAvatar user={me} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{me.name}</p>
                {me.email && (
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden /> {me.email}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {me.role} · Acme Inc
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Name</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg"
                placeholder="Your display name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-title">Title</Label>
              <Input
                id="settings-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-lg"
                placeholder="e.g. Product Designer"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      aria-label="Pick a status emoji"
                      className="h-9 w-11 shrink-0 rounded-lg text-lg"
                    >
                      {statusEmoji || <Smile className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 rounded-xl p-0">
                    <EmojiPicker
                      onSelect={(char) => {
                        setStatusEmoji(char)
                        setEmojiOpen(false)
                      }}
                    />
                    <div className="border-t border-border p-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 rounded-lg text-xs text-muted-foreground"
                        onClick={() => {
                          setStatusEmoji('')
                          setEmojiOpen(false)
                        }}
                      >
                        Clear emoji
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Input
                  value={statusText}
                  onChange={(event) => setStatusText(event.target.value)}
                  className="rounded-lg"
                  placeholder="What are you working on?"
                  aria-label="Status text"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="settings-timezone" className="w-full rounded-lg">
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
              <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                Used to show your local time to teammates.
              </p>
            </div>

            <Button
              disabled={busy}
              onClick={() => void saveProfile()}
              className="w-full rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
            >
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
          </TabsContent>

          {/* ── Notifications ────────────────────────────────────────────────── */}
          <TabsContent value="notifications" className="mt-4 space-y-4 px-5 pb-5">
            <div className="flex items-start gap-3 rounded-xl border border-border p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <BellOff className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="settings-dnd" className="text-sm font-semibold">
                    Do Not Disturb
                  </Label>
                  <Switch
                    id="settings-dnd"
                    checked={me.dndEnabled}
                    disabled={dndBusy}
                    onCheckedChange={(checked) => void toggleDnd(checked)}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  While Do Not Disturb is on, notifications arrive silently — no
                  dings, no badges. Nothing is lost: when it ends you get a
                  single digest with everything that happened.
                </p>
                {me.dndEnabled && (
                  <span
                    className={cn(
                      'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      isQuietHours(me)
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <MoonStar className="h-3 w-3" aria-hidden />
                    {isQuietHours(me)
                      ? quietUntilLabel(me)
                        ? `Quiet until ${quietUntilLabel(me)}`
                        : 'Quiet all day'
                      : me.dndStart && me.dndEnd
                        ? `Scheduled ${formatHHmm(me.dndStart)} – ${formatHHmm(me.dndEnd)} (outside the window now)`
                        : 'Active — outside a scheduled window it stays quiet all day'}
                  </span>
                )}
              </div>
            </div>

            {/* Quiet-hours schedule */}
            <div className="space-y-2.5 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <MoonStar className="h-4 w-4 text-amber-500" aria-hidden />
                <Label className="text-sm font-semibold">Quiet hours schedule</Label>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Set a daily window (it can wrap past midnight). Notifications
                created inside the window are held back and delivered as a
                digest when it ends.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-dnd-start" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="settings-dnd-start"
                    type="time"
                    value={dndStart}
                    onChange={(e) => setDndStart(e.target.value)}
                    className="rounded-lg"
                    aria-label="Quiet hours start time"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-dnd-end" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <Input
                    id="settings-dnd-end"
                    type="time"
                    value={dndEnd}
                    onChange={(e) => setDndEnd(e.target.value)}
                    className="rounded-lg"
                    aria-label="Quiet hours end time"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: '9 PM – 7 AM', start: '21:00', end: '07:00' },
                  { label: '10 PM – 6 AM', start: '22:00', end: '06:00' },
                  { label: 'Noon break', start: '12:00', end: '13:00' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={dndBusy}
                    onClick={() => {
                      setDndStart(preset.start)
                      setDndEnd(preset.end)
                      void saveQuietSchedule(preset.start, preset.end)
                    }}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-700 disabled:opacity-50 dark:hover:text-amber-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                disabled={dndBusy || (!dndStart && !dndEnd)}
                onClick={() => void saveQuietSchedule(dndStart, dndEnd)}
                className="w-full rounded-lg bg-amber-600 font-semibold text-white hover:bg-amber-500"
              >
                {dndBusy ? 'Saving…' : 'Save schedule'}
              </Button>
            </div>

            <EmailNotifSection />

            <div className="rounded-xl bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Fine-grained control</p>
              <p className="mt-1">
                You can also set notification preferences per channel — hover a channel in the
                sidebar or use the bell icon in the channel header to choose between all
                messages, mentions only, or nothing.
              </p>
            </div>
          </TabsContent>

          {/* ── Security ─────────────────────────────────────────────────────── */}
          <TabsContent value="security" className="mt-4 space-y-4 px-5 pb-5">
            {me.kind === 'human' ? (
              <SecurityTab />
            ) : (
              <div className="flex items-start gap-3 rounded-xl border p-4">
                <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Agent accounts authenticate with workspace credentials, not passwords —
                  two-factor authentication doesn&apos;t apply.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Appearance ───────────────────────────────────────────────────── */}
          <TabsContent value="appearance" className="mt-4 space-y-3 px-5 pb-5">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={activeTheme === value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-150',
                      activeTheme === value
                        ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/40'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        activeTheme === value ? 'text-emerald-600' : 'text-muted-foreground',
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {activeTheme === 'system'
                ? 'Acme Chat follows your operating system setting — switch it and the app follows along.'
                : `You're viewing Acme Chat in ${activeTheme} mode.`}
            </p>

            {/* ── Font size / zoom (per user, roams across devices) ─────── */}
            <div className="space-y-2.5 border-t border-border pt-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Font size
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Make everything easier to read — text, buttons and icons scale
                  together, like your browser’s zoom. Saved to your profile, so it
                  follows you on every device.
                </p>
              </div>

              {/* Live sample — renders at the chosen size inside the preview card */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed">
                  The quick brown fox jumps over the lazy dog 🦊
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sarah Chen · 10:24 AM in #general
                </p>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {FONT_SIZE_OPTIONS.map((option) => {
                  const active = Math.abs(activeFontSize - option.value) < 0.001
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Font size ${option.label} — ${Math.round(option.value * 100)}%`}
                      onClick={() => void setFontSize(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-all duration-150',
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                          : 'border-border hover:border-emerald-500/40 hover:bg-accent',
                      )}
                    >
                      {/* Mini text glyph that grows with the option */}
                      <span
                        className={cn(
                          'font-bold leading-none',
                          active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                        )}
                        style={{ fontSize: `${0.65 + option.value * 0.45}rem` }}
                        aria-hidden
                      >
                        Aa
                      </span>
                      <span className="text-[10px] font-semibold">{option.label}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {Math.round(option.value * 100)}%
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Accent color (Slack-style theme picker) ────────────────── */}
            <div className="space-y-2.5 border-t border-border pt-4">
              <div className="space-y-1">
                <Label>Accent color</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Personalize Acme Chat — saved to your profile, so your accent
                  follows you on every device.
                </p>
              </div>

              {/* Live preview strip — every element below is painted with the
                  accent utilities, so the whole strip recolors instantly. */}
              <div
                className="rounded-xl border border-border bg-muted/30 p-3"
                role="img"
                aria-label="Live preview of the accent color on a channel row, unread badge, button, presence dot, typing indicator, link and chip"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
                  <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1.5">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-medium">general</span>
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
                      3
                    </span>
                  </span>
                  <span className="inline-flex h-7 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white">
                    Send
                  </span>
                  <span className="presence-pulse h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="flex items-center gap-1" aria-hidden>
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    View thread
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    New
                  </span>
                </div>
              </div>

              {/* Theme options */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {ACCENT_THEMES.map((accent) => {
                  const active = activeAccent === accent.key
                  return (
                    <button
                      key={accent.key}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${accent.name} accent`}
                      title={accent.name}
                      onClick={() => void setAccentTheme(accent.key)}
                      className={cn(
                        'relative flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-all duration-150',
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/5 ring-2 ring-emerald-500/70'
                          : 'border-border hover:border-emerald-500/40 hover:bg-accent',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
                          aria-hidden
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                      <span className="flex items-center gap-1.5" aria-hidden>
                        {accent.swatches.map((hex) => (
                          <span
                            key={hex}
                            className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-sm dark:border-white/20"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </span>
                      <span className="min-w-0 pr-4">
                        <span className="block truncate text-xs font-semibold">{accent.name}</span>
                        <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                          {accent.vibe}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
