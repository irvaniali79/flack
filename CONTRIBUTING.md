# Contributing to Flack Chat 💬🎉

First off, thanks for taking the time to contribute! ❤️
This guide covers everything you need to file great issues and land great pull
requests.

> **Quick links**
> [Setting up](#-setting-up-your-environment) ·
> [Architecture map](#-where-things-live) ·
> [Code style](#%EF%B8%8F-code-style--conventions) ·
> [Pull requests](#-pull-request-process) ·
> [Security reports](SECURITY.md) ·
> [Code of Conduct](CODE_OF_CONDUCT.md)

---

## 🧭 Ways to contribute

- 🐞 **Report bugs** — open an issue using the *Bug report* form
- 💡 **Propose features** — open an issue using the *Feature request* form
- 📝 **Improve docs** — README, SETUP, code comments, this file
- 🔧 **Submit code** — fixes, features, refactors, accessibility wins
- 🎨 **Polish UI/UX** — spacing, focus states, responsive details,
  dark/light-mode consistency

All contributors are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## 🆘 Where to get help

- **Usage questions** → the [*Usage* section](README.md#️-usage) of the README
  (basics, power features, personalization)
- **How something was built** → `worklog.md` contains a detailed, per-task
  development log with architecture notes and known pitfalls
- **Local setup trouble** → [SETUP.md](SETUP.md) and the
  [*Installation* section](README.md#-installation) of the README
- **Security concerns** → **never** a public issue — see [SECURITY.md](SECURITY.md)

---

## 🛠 Setting up your environment

Prerequisite: **Bun 1.2+** (<https://bun.sh>). Full details in the
[README](README.md#-installation); the short version:

```bash
git clone <your-fork-url> && cd my-project
bun install

# point Prisma at the bundled SQLite database
echo 'DATABASE_URL=file:'$(pwd)'/db/custom.db' > .env
bun run db:generate

# realtime + scheduler services (two background terminals, or &)
cd mini-services/chat-service     && bun install && bun run dev &
cd mini-services/scheduler-service && bun install && bun run dev &

# the app (http://localhost:3000)
bun run dev
```

The bundled database is pre-seeded with demo data — sign in with
`sarah@flack.test` / `demo1234` (owner) or any one-click demo user on the login
screen.

> ⚠️ After changing `prisma/schema.prisma`: run `bun run db:push` **and restart
> the dev server** — the running process keeps the old Prisma client in memory.

---

## 🗺 Where things live

| You're working on… | Look in… |
|---|---|
| REST API endpoints | `src/app/api/**/route.ts` — build on `handle()` + `requireUser()` from `src/lib/auth` |
| Chat UI components | `src/components/chat/` (composer, message-list, sidebar, rail, channel-header…) |
| Dialogs & overlays | `src/components/chat/dialogs/` (profile, settings, search-overlay, image-viewer…) |
| AI agents | `src/components/chat/agents/` + `src/lib/agents/` (runtime, LLM calls) |
| Workflow automation | `src/components/chat/workflows/` + `src/lib/workflows/` (runtime, schedule, triggers) |
| Connectors (app directory) | `src/components/chat/connectors/` + `src/lib/connectors*.ts` |
| Slack import/export + compat API | `src/lib/slack/` + `src/app/api/slack/` |
| MCP tools | `src/lib/mcp/` + `src/app/api/mcp/route.ts` |
| Admin dashboard | `src/components/chat/admin/` + `src/app/api/admin/` |
| Realtime (server→client) | emit via `emitToUsers` (`src/lib/realtime-server`), handle in `src/lib/socket.ts` |
| Theme engine / accents | `src/lib/theme-options.ts` + token blocks in `src/app/globals.css` |
| UI primitives | `src/components/ui/` (shadcn/ui — prefer these over custom CSS) |
| Client state | `src/lib/store.ts` (Zustand) |
| Database schema & seeds | `prisma/` |
| Realtime gateway service | `mini-services/chat-service/` (socket.io, port 3003) |
| Scheduler service | `mini-services/scheduler-service/` (ticks, port 3004) |

---

## 🏷️ Code style & conventions

### TypeScript & React

- **TypeScript everywhere, strict typing** — no `any` in `src/`
- Functional components + hooks; shared logic in `src/lib/`, not inline
- `'use client'` / `'use server'` directives where appropriate
  (the app is client-heavy; API routes are server)
- **Semantic HTML + ARIA** for anything interactive (labels on icon-only
  buttons, `sr-only` text, keyboard focusability, 44px touch targets)
- Loading/error states are part of every async flow (spinners, skeletons,
  toasts via `sonner`)

### Styling

- **Tailwind CSS 4 + shadcn/ui primitives** — never hand-roll a component that
  `src/components/ui/` already provides
- Use theme tokens (`bg-background`, `text-muted-foreground`, `bg-card`, …)
  instead of raw hex colors; accents flow from the 12-theme token system in
  `globals.css`
- Responsive by default: design mobile-first, verify at ~375px, ~768px, ~1280px
- Check both **dark and light mode** — most theme bugs are one-mode-only

### Project-specific rules (learned the hard way — see `worklog.md`)

1. **Font-size scaling:** the per-user font size drives a CSS `zoom` on `<html>`
   via the `--ui-scale` variable. **Every full-viewport height must use the
   `h-app` / `min-h-app` utilities or divide its `vh`/`dvh` units by
   `var(--ui-scale)`** — otherwise the layout scrolls or clips at large sizes.
   Percentages and fixed insets need no compensation.
2. **Avatars:** profile avatars are perfect circles by design — the `UserAvatar`
   wrapper is `rounded-full`, so rings/borders placed on it paint as circles.
   Never wrap avatars in un-rounded `overflow-hidden` ancestors, and keep
   focus rings on avatar buttons **unscoped** (`focus:` not `focus-visible:`)
   so mouse clicks paint the ring too.
3. **Message sending:** the composer uses a synchronous `sendingRef` guard —
   don't await between the guard check and the send, or double-send bugs
   reappear.
4. **Realtime events:** when an API route mutates something other users can
   see, broadcast it (`emitToUsers`) and handle it in `src/lib/socket.ts` —
   stale-state bugs come from skipping this.
5. **Prisma:** schema primitive types can't be lists — model arrays as
   relations or JSON strings.

### Database changes

1. Edit `prisma/schema.prisma`
2. `bun run db:push`
3. **Restart the dev server**
4. If seeds are affected, update the matching `prisma/seed*.ts` script

---

## ✅ Quality gates

All of these must pass before a PR is reviewable:

```bash
bun run lint        # ESLint — 0 errors
npx tsc --noEmit    # TypeScript — 0 errors in src/
```

Plus **manual QA in the browser** — exercise the flow you touched (send, edit,
react, search, open the dialog…) in both dark and light mode, watch the console
for errors, and check a mobile-width viewport for anything UI-facing.

---

## 📝 Commit messages

The history uses a `Type: summary` convention — keep it up:

```
Feat: emoji autocomplete in the composer
Fix: sidebar overflow at 145% font size
Polish: round focus rings on all avatar buttons
Docs: add SECURITY.md and issue templates
Rebrand: Acme → Flack
```

Branch naming: `feat/…`, `fix/…`, `docs/…`, `polish/…` off `main`.

---

## 🔄 Pull request process

1. **Open an issue first** for anything non-trivial (features, behavior changes)
   so we can align before you write code — small fixes can go straight to a PR
2. Create a branch, make your change, keep commits focused
3. Fill in the
   [pull request template](.github/PULL_REQUEST_TEMPLATE.md)
   — what, why, QA performed, screenshots for UI changes
4. Ensure the quality gates pass (lint, tsc, manual QA)
5. Request review and respond to feedback — PRs are merged as squashed commits
   with a clean `Type: summary` title

### Reviewing expectations

Reviews focus on correctness, accessibility, both themes, mobile behavior, and
conformance to the conventions above. Be kind, be specific, be patient — see
the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 💡 Good first issues (from the backlog)

Ideas that are scoped, designed, and waiting for a taker:

- **Emoji autocomplete in the composer** — `:`-triggered picker fed by
  `src/lib/emoji.ts` + custom emoji
- **Connector slash-commands** — `/github …`, `/jira …` in the composer,
  routed through the connector action API
- **Per-connector multi-channel routing** — one connection posting to several
  channels
- **Admin connector overview grid** — health + last event per connection
- **Accent theme quick-switcher** in the profile menu

## 📄 License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](LICENSE).
