# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Flack Chat — production app image (Next.js 16 standalone + Prisma/SQLite)
#
# Part of the 4-service docker-compose stack:
#   app (this image) · chat (:3003) · scheduler (:3004) · gateway (Caddy :80)
#
# Build context: repository root. Base: oven/bun:1-slim (Debian bookworm).
# Bun runs everything: package scripts, the Prisma CLI, and the standalone
# Next server (same commands the repo documents for bare-metal installs).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 · deps — lockfile-exact node_modules ────────────────────────────
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2 · builder — prisma generate + next build (standalone) ───────────
FROM oven/bun:1-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock next.config.ts tsconfig.json tailwind.config.ts \
     postcss.config.mjs components.json eslint.config.mjs ./
COPY prisma ./prisma
COPY db ./db
COPY public ./public
COPY src ./src
# Build-time placeholder — the runtime DATABASE_URL points into the volume.
# A real db file is copied in so any build-time page-data collection that
# touches Prisma finds a valid SQLite database instead of an error.
ENV DATABASE_URL="file:/app/db/custom.db"
RUN bunx prisma generate && bun run build

# ── Stage 3 · runner — minimal production image ─────────────────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/app/db/custom.db" \
    NEXT_TELEMETRY_DISABLED=1

# openssl → Prisma query engine (debian-openssl-3.0.x)
# ca-certificates → outbound HTTPS (AI SDK, connector fetches)
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Next standalone bundle: server.js + traced node_modules + .next/static
# + public (the repo's "build" script already copies static/ and public/
# into .next/standalone).
COPY --from=builder /app/.next/standalone ./

# Guarantee Prisma survives (Next file tracing can drop engines/CLI):
#   @prisma/client + .prisma (generated client + query engine) → the app
#   prisma (CLI) → `prisma db push` in the entrypoint keeps the schema in sync
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# First-boot seeds — docker/entrypoint.sh copies these into the volumes
# (demo database + demo uploads: avatars and custom-emoji images).
COPY db ./db-seed
COPY uploads ./uploads-seed

COPY docker/entrypoint.sh docker/seed-fresh.ts ./docker/
RUN chmod +x docker/entrypoint.sh && mkdir -p /app/db /app/uploads

EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["bun", ".next/standalone/server.js"]
