# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# chat-service — socket.io realtime gateway (port 3003, path '/')
#
# Standalone Bun service (own package.json / bun.lock). The socket.io path
# MUST stay '/' — the gateway routes browser traffic as io("/?XTransformPort=3003").
# Stateless (presence lives in memory; no database), so this image is tiny.
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY index.ts ./
EXPOSE 3003
CMD ["bun", "index.ts"]
