'use client'
// API key management — list, create (one-time secret reveal + per-key MCP
// scopes), revoke.
import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { KeyRound, Loader2, Lock, Plus, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ApiKeyDTO } from '@/lib/types'
import { CopyButton } from './code-block'

const ALL_SCOPES = ['messages:read', 'messages:write', 'channels:read', 'channels:write'] as const

const SCOPE_HINTS: Record<string, string> = {
  'messages:read': 'read_channel · get_thread · search_messages',
  'messages:write': 'post_message · add_reaction',
  'channels:read': 'list_channels',
  'channels:write': 'create_channel',
}

function scopeTone(scope: string): string {
  if (scope.endsWith(':write')) return 'border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400'
  return 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
}

function rel(iso: string | null): string {
  if (!iso) return 'never'
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScopes, setNewScopes] = useState<string[]>([...ALL_SCOPES])
  const [busyCreate, setBusyCreate] = useState(false)
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null)
  const [revoking, setRevoking] = useState<ApiKeyDTO | null>(null)
  const [busyRevoke, setBusyRevoke] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: ApiKeyDTO[] }>('/api/keys')
      setKeys(data.keys)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load API keys')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (busyCreate) return
    const name = newName.trim()
    if (!name) {
      toast.error('Give the key a name first')
      return
    }
    setBusyCreate(true)
    try {
      const data = await api<{ key: ApiKeyDTO; secret: string }>('/api/keys', {
        method: 'POST',
        body: { name, scopes: newScopes },
      })
      setSecret({ name: data.key.name, secret: data.secret })
      setCreating(false)
      setNewName('')
      setNewScopes([...ALL_SCOPES])
      void load()
      toast.success(`Key “${data.key.name}” created`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create key')
    } finally {
      setBusyCreate(false)
    }
  }

  const revoke = async () => {
    if (!revoking || busyRevoke) return
    setBusyRevoke(true)
    try {
      await api(`/api/keys/${revoking.id}`, { method: 'DELETE' })
      toast.success(`Revoked “${revoking.name}” — MCP clients using it will get 401`)
      setRevoking(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke key')
    } finally {
      setBusyRevoke(false)
    }
  }

  const toggleScope = (scope: string) => {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  const activeCount = keys?.filter((k) => !k.revokedAt).length ?? 0

  return (
    <section aria-labelledby="api-keys-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 id="api-keys-heading" className="text-sm font-bold">
              API keys
            </h2>
            <p className="text-xs text-muted-foreground">
              Bearer tokens for the MCP server — one key per client.
            </p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New key
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {/* one-time secret reveal */}
      {secret && (
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            “{secret.name}” created — copy it now
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the only time the full key is shown. It is stored as a SHA-256 hash and cannot be
            recovered.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs">
              {secret.secret}
            </code>
            <CopyButton text={secret.secret} label="Copy key" />
            <Button size="sm" variant="outline" className="h-7 rounded-md text-xs" onClick={() => setSecret(null)}>
              I saved it
            </Button>
          </div>
        </div>
      )}

      {/* key list */}
      {!keys ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading keys…
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          No API keys yet. Create one to connect Claude Desktop, Cursor or any MCP client.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {keys.map((key, i) => {
            const revoked = !!key.revokedAt
            const fullAccess = key.scopes.length >= ALL_SCOPES.length
            return (
              <li
                key={key.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors sm:flex-nowrap ${
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/40'
                } ${revoked ? 'opacity-60' : 'hover:bg-accent/50'}`}
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{key.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {key.keyPrefix}…
                  </code>
                  {revoked ? (
                    <Badge variant="outline" className="h-5 gap-1 border-destructive/40 px-1.5 text-[10px] text-destructive">
                      <ShieldAlert className="h-3 w-3" aria-hidden /> Revoked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 gap-1 border-emerald-500/40 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" aria-hidden /> Active
                    </Badge>
                  )}
                  {fullAccess ? (
                    <span
                      className="flex h-5 items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 text-[10px] font-medium text-muted-foreground"
                      title="All MCP tools allowed"
                    >
                      <Lock className="h-3 w-3" aria-hidden /> full access
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge
                          key={scope}
                          variant="outline"
                          className={cn('h-5 px-1.5 font-mono text-[10px]', scopeTone(scope))}
                        >
                          {scope}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={`Created ${new Date(key.createdAt).toLocaleString()}`}>
                  created {rel(key.createdAt)}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground" title={key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never used'}>
                  used {rel(key.lastUsedAt)}
                </span>
                {!revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 rounded-lg p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Revoke ${key.name}`}
                    onClick={() => setRevoking(key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {activeCount >= 10 && (
        <p className="text-[11px] text-muted-foreground">Key limit reached (10 active) — revoke one to create another.</p>
      )}

      {/* create dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-label="Create API key">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl">
            <h3 className="text-sm font-bold">New API key</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Name it after the client that will use it, e.g. “Claude Desktop”.
            </p>
            <Input
              autoFocus
              className="mt-3"
              placeholder="Key name"
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
                if (e.key === 'Escape') setCreating(false)
              }}
            />

            {/* MCP scopes */}
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">MCP scopes</p>
                {newScopes.length === ALL_SCOPES.length ? (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setNewScopes(['messages:read', 'channels:read'])}
                  >
                    read-only preset
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setNewScopes([...ALL_SCOPES])}
                  >
                    select all
                  </button>
                )}
              </div>
              <div className="space-y-1 rounded-lg border border-border p-2">
                {ALL_SCOPES.map((scope) => {
                  const checked = newScopes.includes(scope)
                  return (
                    <label
                      key={scope}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 transition-colors',
                        checked ? 'bg-muted/60' : 'hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleScope(scope)}
                        className="mt-0.5"
                        aria-label={scope}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-[11px] font-semibold">{scope}</span>
                        <span className="block text-[10px] leading-tight text-muted-foreground">{SCOPE_HINTS[scope]}</span>
                      </span>
                    </label>
                  )
                })}
                {newScopes.length === 0 && (
                  <p className="px-1.5 pt-1 text-[10px] text-amber-600 dark:text-amber-400">
                    No scopes selected — the key will get full access.
                  </p>
                )}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Scoped keys can only call tools within their scopes — out-of-scope tool calls fail with a clear error.
              </p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={create} disabled={busyCreate}>
                {busyCreate && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Create key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* revoke confirm */}
      <AlertDialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              MCP clients authenticating with this key will immediately get 401 Unauthorized. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep key</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={revoke}
              disabled={busyRevoke}
            >
              {busyRevoke && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
