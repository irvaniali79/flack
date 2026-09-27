# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# scheduler-service — 60s dumb ticker (port 3004)
#
# POSTs /api/internal/tick on the app with the shared TICK_SECRET every 60s;
# all scheduling smarts live in the app's workflow engine. Zero npm
# dependencies — pure Bun — so a single stage is enough.
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json index.ts ./
EXPOSE 3004
CMD ["bun", "index.ts"]
