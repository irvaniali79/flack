# Flack Chat — Project Download

**Archive:** `new-x.zip` (the current canonical build)

A Slack-style team chat platform with AI Agents, MCP-style tools, workflow automation, a 20-connector App Directory (Google Calendar, Google Drive, GitHub, Zoom, …), 12 color accent themes, Slack migration tooling, and a Slack-compatible API layer.

---

## 1. What's inside

| Path | Purpose |
|---|---|
| `my-project/src/` | Full Next.js 16 app (App Router, TypeScript, Tailwind 4, shadcn/ui) |
| `my-project/prisma/` | Schema + seed scripts (SQLite via Prisma) |
| `my-project/db/custom.db` | **Pre-seeded database** — org, 8 users, 9 channels, messages, threads, reactions, workflows, connectors, custom emoji |
| `my-project/mini-services/chat-service/` | socket.io realtime service (port 3003) |
| `my-project/mini-services/scheduler-service/` | scheduled-workflow tick service |
| `my-project/uploads/` | uploaded files + custom emoji images |
| `my-project/.git/` | full version history (every dev round committed) |
| `my-project/worklog.md` | detailed development handover log (all 18 rounds) |

Excluded from the archive (regenerable): `node_modules/`, `.next/`, `skills/`, `tool-results/`.

---

## 2. Prerequisites

- **Bun 1.2+** (recommended — all scripts use it): https://bun.sh
- Any modern browser. No other infrastructure needed (SQLite, zero external services).

---

## 3. Setup (3 steps)

```bash
# 1) Extract & enter
unzip new-x.zip && cd my-project

# 2) Point the DB at your local copy
#    Edit .env — replace the absolute sandbox path with:
#    DATABASE_URL="file:../db/custom.db"
#    (relative to prisma/schema.prisma → resolves to my-project/db/custom.db)

# 3) Install & run
bun install
bun run dev            # → http://localhost:3000
```

**Realtime + scheduled workflows (optional but recommended):**

```bash
# second terminal — socket.io service (port 3003)
cd mini-services/chat-service && bun install && bun run dev

# third terminal — scheduler ticks for scheduled workflows
cd ../scheduler-service && bun run dev
```

> The DB is already seeded — no `db:push`/seed needed. To regenerate from scratch instead: `bun run db:push && bunx tsx prisma/seed.ts` (⚠️ wipes current data), then `bunx tsx prisma/seed-emoji.ts`, `bunx tsx prisma/seed-connectors.ts`.

---

## 4. Log in

- **Owner (full admin):** `sarah@flack.test` / `demo1234`
- **Member (limited perms):** `priya@flack.test` / `demo1234`
- All seeded humans share the password `demo1234`. There's also a one-click demo-login on the auth screen.

---

## 5. Feature tour (where to click)

- **Chat:** channels, DMs, group DMs, threads, reactions, pins, forwards, saves, file uploads, emoji picker + custom emoji, presence, DND/quiet hours, global search (`Ctrl+K`)
- **Agents & MCP:** Admin → Agents (Aria, CodeReviewer are chat-capable), Integrations → MCP tool playground (`post_message`, `read_channel`, `search_messages`), API keys
- **Workflows:** trigger on message/schedule/webhook, visual builder, run history (Runs drawer)
- **Connectors:** rail → Blocks — 20-app directory, 3-step connect, live event cards in #general / #engineering / #design, per-connection management, "Send test event"
- **Themes:** Settings (`Ctrl+,`) → Theme — 12 accent palettes, persisted per user
- **Slack migration:** Admin → Slack import (JSON upload), Slack-compat API at `/api/slack/*`, cutover readiness report
- **Security:** 2FA (TOTP) in Settings → Security, admin session management

Full details, gotchas, and architecture notes: see `worklog.md` in the archive root.
