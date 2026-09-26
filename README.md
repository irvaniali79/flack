# Flack Chat 💬

**A Slack-style team chat platform** — channels, DMs, threads, AI agents, workflow automation, 20 real connectors, and a Slack-compatible API. Built as a production-grade reference app with Next.js 16.

> Full-featured · Self-contained (SQLite, zero external services) · Dark/light · 12 accent themes · Realtime via socket.io

---

## ✨ Features

| Area | Highlights |
|---|---|
| **Messaging** | Channels (public/private), DMs & group DMs, threads, emoji reactions, pinning, forwarding, saved items, file & image uploads (25 MB), custom emoji, message editing & deletion, jump-to-message, unread tracking & mention badges |
| **Right-click menus** | Slack-style context menus on messages (react, reply, mark unread from here, pin, save, copy text/link, share, edit, delete) and on channels/DMs (mark read/unread, mute, rename, leave, copy link, view profile) |
| **Search** | Global search (`Ctrl`/`⌘`+`K`) across messages, channels and people with filters (`from:`, `in:`, `is:`) |
| **AI Agents** | Chat with AI teammates in DMs, agent @mentions in channels, MCP-style tools, workflows with triggers & scheduled runs |
| **Connectors (App Directory)** | 20 connectors (Google Calendar, GitHub, Zoom, Jira, …) with live autonomous events, interactive card actions, per-connection channel routing, connect/pause management |
| **Presence & status** | Online/away dots, custom status (emoji + text), Do Not Disturb with quiet-hours schedules and digest |
| **Profiles** | Profile photo + cover photo upload, title, timezone, local-time display — click any avatar anywhere to view a profile |
| **Appearance** | Dark / light / system themes, **12 accent themes**, **per-user font size (zoom)** — all saved to your profile and roaming across devices |
| **Security** | Password auth with sessions, TOTP two-factor auth (RFC 6238) with recovery codes, admin dashboard with session management |
| **Slack compatibility** | Export/import migration tools (channels, users, messages, reactions), Slack-compatible REST API layer |
| **Accessibility** | Keyboard navigation, focus rings, ARIA labels, reduced-motion support, 44px touch targets |

---

## 🧱 Tech stack

- **Framework**: Next.js 16 (App Router) · React 19 · TypeScript 5
- **Styling**: Tailwind CSS 4 · shadcn/ui (New York) · lucide-react icons
- **State**: Zustand (client) · socket.io-client (realtime)
- **Database**: Prisma ORM with SQLite (file-based, zero setup)
- **Realtime**: socket.io mini-service (`mini-services/chat-service`)
- **Scheduler**: tick mini-service (`mini-services/scheduler-service`) for workflows + connector events
- **AI SDK**: `z-ai-web-dev-sdk` (backend only)

---

## 📦 Project structure

```
my-project/
├── src/
│   ├── app/                    # Next.js App Router — pages + API routes
│   │   ├── api/                # REST endpoints (auth, channels, messages, files, connectors…)
│   │   └── globals.css         # Tailwind + theme tokens (12 accents, light/dark)
│   ├── components/
│   │   ├── chat/               # the entire chat UI (sidebar, composer, messages, dialogs…)
│   │   └── ui/                 # shadcn/ui primitives
│   └── lib/                    # store, socket client, serializers, auth, theme engine
├── prisma/schema.prisma        # database schema
├── db/custom.db                # SQLite database (pre-seeded demo data)
├── mini-services/
│   ├── chat-service/           # socket.io realtime gateway (port 3003)
│   └── scheduler-service/      # workflow + connector tick service (port 3004)
├── uploads/                    # uploaded files & custom emoji images
├── worklog.md                  # detailed development handover log
└── SETUP.md                    # quick archive-setup guide
```

---

## 🚀 Installation

### Prerequisites

- **Bun 1.2+** (recommended) — <https://bun.sh> — or Node.js 20+/npm as a fallback
- A modern browser (Chrome, Edge, Firefox 126+, Safari 17+)
- No other infrastructure — SQLite ships with the repo, no external services required

### Steps

```bash
# 1) Install dependencies
bun install

# 2) Point the database at your local copy
#    Edit .env and set the absolute path to the bundled SQLite file:
echo 'DATABASE_URL=file:'$(pwd)'/db/custom.db' > .env

# 3) Generate the Prisma client
bun run db:generate

# 4) (Optional) apply the schema — the bundled DB is already in sync
bun run db:push

# 5) Start the realtime + scheduler mini-services (separate terminals or &) 
cd mini-services/chat-service     && bun install && bun run dev &
cd mini-services/scheduler-service && bun install && bun run dev &

# 6) Start the app
bun run dev
```

Open <http://localhost:3000> — you're in. The bundled database is **pre-seeded** with an org, 8 users, 9 channels, threads, reactions, workflows and connectors.

> 💡 The mini-services auto-reload on change (`bun --hot`). The main app logs to `dev.log`.

### Demo accounts

The login screen lists one-click demo users. The primary account:

| Email | Password | Role |
|---|---|---|
| `sarah@flack.test` | `demo1234` | Workspace owner |

---

## ⚙️ Configuration

### Environment (`.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Prisma SQLite connection string — `file:<absolute-path>/db/custom.db` |

That's the only required config. Everything else lives in the database.

### Ports

| Service | Port | Purpose |
|---|---|---|
| Next.js app | 3000 | UI + REST API |
| chat-service | 3003 | socket.io realtime gateway |
| scheduler-service | 3004 | workflow ticks + autonomous connector events |

### Database

- Schema: `prisma/schema.prisma` — edit, then `bun run db:push`
- ⚠️ **Restart the dev server after `db:push`** — the running process keeps the old Prisma client in memory
- Reset to a fresh schema: `bun run db:reset`

### Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start Next.js in dev mode (port 3000, logs to `dev.log`) |
| `bun run lint` | ESLint (project rule: 0 errors) |
| `bun run build` / `bun run start` | Production build & serve |
| `bun run db:push` | Apply schema changes to SQLite |
| `bun run db:generate` | Regenerate the Prisma client |
| `bun run db:migrate` | Create/apply a migration |
| `bun run db:reset` | Drop & re-seed the database |

---

## 🖥️ Usage

### The basics

1. **Sign in** with a demo account (or create one via *Create account*)
2. **Channels** — click any channel in the sidebar; `#general` is the default. Browse or create with the `+` buttons
3. **Send messages** — type in the composer, `Enter` to send, `Shift+Enter` for a new line
4. **Threads** — hover a message → 💬 *Reply in thread* (or right-click → *Reply in thread*)
5. **DMs** — the ✏️ next to *Direct messages* starts a conversation with any teammate or AI agent
6. **Profiles** — click any avatar (message, member list, DM header) to view a profile; edit yours via the profile dialog or Settings

### Power features

- **Right-click anything** — messages and sidebar rows have full Slack-style context menus
- **`Ctrl`/`⌘`+`K`** — global search with filters: `from:sarah`, `in:#general`, `is:unread`
- **Slash commands** — `/me`, `/shrug`, `/tableflip`, `/unflip`, `/topic`
- **Emoji autocomplete** — type `:` followed by a name in the composer
- **Workflows** — the ⚡ icon builds automated workflows (triggers: keyword, schedule, event)
- **App Directory** — the 🧩 icon connects apps; connected apps stream live events into your channels and their card buttons perform real actions
- **Keyboard shortcuts** — `Ctrl`/`⌘`+`K` search, `Ctrl`/`⌘`+`/` shortcut cheat-sheet, `↑` edit your last message, `Esc` close/cancel

### Personalization (Settings ⚙️)

- **Profile** — name, title, status (emoji + text), timezone, **profile photo + cover photo**
- **Alerts** — Do Not Disturb, quiet-hours schedule, email digest
- **Security** — TOTP two-factor auth with recovery codes
- **Theme** — dark/light/system, **12 accent colors**, and **font size** (Small 85% → Huge 145%) — the whole UI scales like browser zoom and follows your account across devices

---

## 🤝 Contributing

Contributions are welcome! The project follows a simple workflow:

1. **Fork / branch** — create a feature branch from `main`
   ```bash
   git checkout -b feat/my-feature
   ```
2. **Follow the code style**
   - TypeScript everywhere, strict typing (no `any` in `src/`)
   - Tailwind + existing shadcn/ui components over new custom CSS
   - `'use client'` / `'use server'` directives where appropriate
   - Semantic HTML + ARIA labels for anything interactive
3. **Keep the quality gates green**
   ```bash
   bun run lint        # must pass with 0 errors
   npx tsc --noEmit    # src/ must be error-free
   ```
4. **Test your changes** — exercise the affected flows in the browser (send, edit, react, search, etc.) before committing
5. **Commit with a clear message** and open a pull request describing **what + why**

### Where things live (for contributors)

- New API endpoint → `src/app/api/<route>/route.ts` (use `handle()` + `requireUser()` from `src/lib/auth`)
- New realtime event → emit from an API route via `emitToUsers` (`src/lib/realtime-server`), handle in `src/lib/socket.ts`
- New accent theme → `src/lib/theme-options.ts` + token blocks in `src/app/globals.css`
- New connector → `src/lib/connectors-catalog.ts`
- New UI dialog → `src/components/chat/dialogs/`

---

## 🐞 Reporting bugs

Found something broken? Please include:

1. **What you did** — exact steps ("right-clicked a message → Mark unread")
2. **What you expected** vs **what happened**
3. **Environment** — browser + version, OS, light/dark mode, accent theme, font-size setting
4. **Console output** — open DevTools → Console and copy any red errors
5. **Screenshot or screen recording** if visual

Send it to the project maintainer or open an issue in the repository. For urgent regressions, check `dev.log` and `worklog.md` first — known issues and recent changes are documented there.

---

## 📄 License

Provided as a reference implementation for evaluation and learning.

---

## 🙏 Acknowledgments

- UI patterns inspired by **Slack** (context menus, threads, presence, display preferences)
- Components from **shadcn/ui** and the Radix ecosystem
- Icons by **lucide-react**
- More implementation details in **`worklog.md`** (per-task development log) and **`SETUP.md`** (archive quick-start)
