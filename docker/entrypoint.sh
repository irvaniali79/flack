#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Flack app container entrypoint
#
#   1. Seed the bundled demo database into the (empty on first boot) /app/db
#      volume — or create a minimal fresh workspace when FLACK_SEED_DEMO=0
#   2. Keep the Prisma schema in sync (safe no-op when already in sync)
#   3. Copy the bundled demo uploads into /app/uploads (never overwrites)
#   4. exec the CMD (Next.js standalone server)
# ─────────────────────────────────────────────────────────────────────────────
set -e

log() { echo "[flack-entrypoint] $*"; }

mkdir -p /app/db /app/uploads

# Was the database volume empty when we booted? (captured before db push,
# because db push creates a non-empty file with the full schema)
DB_WAS_EMPTY=0
if [ ! -s /app/db/custom.db ]; then DB_WAS_EMPTY=1; fi

# ── 1) demo database ────────────────────────────────────────────────────────
if [ "$DB_WAS_EMPTY" = "1" ] \
   && [ "${FLACK_SEED_DEMO:-1}" = "1" ] \
   && [ -f /app/db-seed/custom.db ]; then
  cp /app/db-seed/custom.db /app/db/custom.db
  DB_WAS_EMPTY=0
  log "seeded demo database → /app/db/custom.db (login: sarah@flack.test / demo1234)"
fi

# ── 2) schema sync ──────────────────────────────────────────────────────────
# Creates all tables on a blank database; instant no-op when in sync.
# Never destructive — prisma refuses destructive drift without --accept-data-loss.
if bunx prisma db push --skip-generate >/dev/null 2>&1; then
  log "prisma schema is in sync"
else
  log "WARNING: prisma db push failed — starting with the database as-is"
fi

# ── 3) fresh workspace (empty volume + FLACK_SEED_DEMO=0) ───────────────────
# Without this the app would be a dead end: register() needs an existing org.
if [ "$DB_WAS_EMPTY" = "1" ]; then
  log "creating a fresh workspace (FLACK_SEED_DEMO=0)…"
  if bun docker/seed-fresh.ts; then
    :
  else
    log "WARNING: fresh workspace seed failed — starting with an empty schema"
  fi
fi

# ── 4) demo uploads (avatars + custom emoji), without clobbering user files ─
if [ -d /app/uploads-seed ]; then
  cp -rn /app/uploads-seed/. /app/uploads/ 2>/dev/null || true
fi

log "starting: $*"
exec "$@"
