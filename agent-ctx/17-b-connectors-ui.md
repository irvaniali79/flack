# Task 17-b — Connectors UI (app directory, connect dialog, connection management, app-card messages)

Agent: connectors-ui (Z.ai Code subagent) · Status: COMPLETE · Owner files: `src/lib/view-store.ts`, `src/components/chat/rail.tsx`, `src/components/chat/app.tsx`, `src/components/chat/connectors/*`, `src/components/chat/message-item.tsx`, badge tweaks in channel-header/new-dm/profile-dialog/search-overlay.

## What shipped

1. **App directory view** (`src/components/chat/connectors/connectors-view.tsx`)
   - Violet-accented header (Blocks icon, "App directory", back-to-chat, refresh), stats chips (20 connectors available · N connected · K events flowing with a live pulse dot).
   - "Your connections" grid: one `ConnectionCard` per active connection.
   - Directory: category chip strip (All + 9, horizontal scroll on mobile) + search (name/tagline/category), responsive grid 1→2→3 cols, framer-motion staggered entrance + hover lift, empty state with Clear filters.
   - Directory cards: ConnectorTile, name + category badge, tagline, event/scope count chips, emerald "N connected" chip, Connect (admin) / Manage (scrolls to connection card + violet flash ring) / disabled Connect with "Requires admin" tooltip (members — verified as priya: all 17 Connect buttons disabled, tooltip renders, Send test event still enabled, no Manage buttons).

2. **connector-icon.tsx** — client icon-key → lucide map (calendar, calendar-days, hard-drive, github, video, film, trello, clipboard→ClipboardList, bug, gauge, cloud, dropbox→**CloudUpload — lucide-react has NO Dropbox export, verified**), box, notebook→NotebookPen, table→Table2, lifebuoy, presentation, pen-tool, palette, zap, fallback Puzzle. `CONNECTOR_BRAND` map (all 20 connectorIds → icon/color/name) because **src/lib/connectors.ts is NOT client-safe** (it imports Prisma `db` at module level — do not import it from client code despite the task brief saying it's safe). `ConnectorTile` (brand bg, white glyph; luminance check flips to dark glyph on bright brands like Miro #ffdd00 / Canva / Airtable). `brandTextColor()`. Shared `AppBadge` component.

3. **connect-dialog.tsx** — 3-step Slack-style install: (1) Account input + sample-account suggestion chips + min-3-char validation, (2) OAuth-consent scope checklist ("X will be able to:"), (3) channel Select (public/private only, DMs excluded) + event checkboxes (defaultOn defaults). Step indicator (numbered pills, done-check), Back/Next/Connect with busy state, error toasts (API messages surface clean), success toast "Connected to #channel" + "View in channel" action.

4. **connection-card.tsx** — icon tile, name, mono account label, clickable destination channel chip (→ openChannel + setView('chat')), connected-by + relative time, "N events subscribed" chip, Send test event (any member; toast with event title as description), admin Manage expander: destination channel Select (optimistic PATCH), per-event Switches (PATCH full enabled eventIds list, optimistic + revert), Disconnect with AlertDialog confirm. Members see no Manage (PATCH/DELETE are admin-or-owner server-side; DTO has only connectedBy NAME, no id — so UI gates on isAdmin).

5. **message-item.tsx** — app messages (connectorId + connectorPayload): avatar slot renders ConnectorTile (brand color), APP badge next to sender name (shared AppBadge), body replaced by `ConnectorAppCard`: rounded-xl bordered card, 3px brand left border + low-alpha brand gradient tint (inline hex+alpha works light+dark), bold title, dt/dd field rows (label w-24 muted), actions (primary = brand-filled w/ brandTextColor, default = outline) → `toast.info('Demo action — connectors are simulated in this sandbox')`, muted footer. Hover toolbar / reactions / threads / pin / delete all still work. Verified in main list AND thread panel (root card renders fully).

6. **APP badges + presence fixes**: channel-header members popover, new-dm dialog, profile dialog, search-overlay people list — AppBadge for kind==='app'; presence dots skipped for apps (`presence={user.kind !== 'app'}`). sidebar DM rows were already human-only. Nothing broke with app users in channel member lists (avatarColor renders, name shows).

7. **Rail + wiring**: `Blocks` icon button between Workflows and Integrations ("App directory — connectors"), `'connectors'` added to MainView, view switch in app.tsx.

## QA (browser session t17b via localhost:81, sarah@acme.test)

- 20 connectors render; Design filter → exactly Figma/Miro/Canva; Google Workspace filter → 2 cards; search "trello" → 1 card; All reset works.
- #engineering: GitHub PR #482 app card (tile bg rgb(36,41,47) verified via computed styles, APP badge, DescriptionList fields, Review PR/Approve buttons) → clicked Review PR → demo toast ✓.
- Send test event (Google Calendar) → POST 200, toast "Event posted to #general" + event title; new message appeared live in #general via websocket.
- Full Trello → #design connect flow: validation (2 chars disables Next + inline error), suggestion chip, consent list, channel Select (Radix — used ref clicks per worklog convention), event defaults (2 of 3 on) → POST 200 → "Connected to #design" toast + View in channel → "Trello joined #design" card in #design with Account/Connected by/Events fields + footer.
- Manage: expanded panel (channel combobox, 3 Switches, Disconnect), toggled "Due soon" → PATCH 200 + chip "3 events subscribed", disconnect → confirm dialog → DELETE 200 → connections back to 3.
- Thread panel renders the app card (fields + action + APP badge).
- Mobile 390px: no page-level horizontal overflow (only the category chip strip scrolls horizontally by design); connection/directory grids stack to 1 col (358px). Light mode renders (tile + white bg verified); dark restored.
- 0 page errors; console clean (only React DevTools/HMR/Fast-Refresh dev noise).

## Demo state restored

Disconnected the QA Trello connection (now status='disconnected'); hard-deleted 4 QA-created messages (2 #general test events + "Trello joined #design" + "Trello was disconnected") via a one-off Prisma script — final state: **3 connected (gcal→#general, github→#engineering, gdrive→#design), 5 app messages, directory shows 20/3/10**.

## Caveats / notes for the orchestrator

- **src/lib/connectors.ts must never be imported client-side** (Prisma at module scope). The client brand map in connector-icon.tsx mirrors the catalog — if a connector is ever added server-side, add it to CONNECTOR_BRAND too (fallback = Puzzle + sender avatarColor, degrades gracefully).
- Parallel-agent interference: the dev server restarted once mid-QA (down ~4 min) and Fast Refresh remounts reset the zustand view mid-flow several times (app.tsx's `activeChannelId → setView('chat')` effect only fires on CHANGE, so a remount while the same channel is active can leave a non-chat view showing — pre-existing behavior, not connector-specific; the Home rail button recovers instantly).
- lint 0 errors · `bunx tsc --noEmit` clean for src/ (pre-existing errors only in examples/, mini-services/, skills/).
- lucide has no Dropbox glyph → CloudUpload stand-in (commented in the icon map).
