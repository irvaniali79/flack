# Work Record — Task 1-b: Realtime chat-service (socket.io mini-service)

Agent: Z.ai Code (chat-service builder)
Status: DONE — service LIVE on :3003, 18/18 smoke checks PASS

## What was built

`/home/z/my-project/mini-services/chat-service/` — standalone Bun project:

- `package.json` — deps: socket.io ^4.8.1; devDeps: socket.io-client ^4.8.1 (test only); `dev: bun --hot index.ts`
- `index.ts` — the service: socket.io on hardcoded port 3003, path '/' (gateway requirement), cors '*', pingTimeout 60000, pingInterval 25000
- `scripts/test-client.ts` — 18-check smoke test (exit ≠ 0 on any FAIL)
- `service.log` — runtime log (terse, timestamped)

Protocol (matches Task 0 contract exactly):
- Client→server: `hello {userId,name}` (joins `user:{id}`, presence broadcast only on 0→1), `channel:join/leave {channelId}`, `typing {channelId,name}` (relayed to room except sender, `kind:'human'`), `presence:list` (ack → string[] of online userIds)
- Server→client (via internal HTTP): `message:new/updated/deleted`, `reaction:updated`, `typing`, `presence:update`, `notification:new`, `channels:refresh`
- Internal HTTP (same server): `POST /internal/emit {rooms,event,data}` → `{ok,sent}`, `POST /internal/typing {channelId,name,stop}` → agent typing (`userId:'__agent__'`, `kind:'agent'`), `GET /health` → `{ok,uptime,sockets,onlineUsers}`, `GET /` → service info
- Presence: `Map<userId, Set<socketId>>`; offline broadcast when last socket leaves
- Robustness: every handler try/catch-wrapped, malformed payloads warn+ignored, graceful SIGTERM/SIGINT (verified), never-crash error hooks

## Two critical discoveries (read before modifying)

1. **socket.io 4.8.3 + `path:'/'` swallows ALL http requests** — engine.io's internal check is
   `'/' === req.url.slice(0,1)`, so /health and /internal/* returned `{"code":0,"message":"Transport unknown"}`.
   Fix in index.ts (no monkey-patching of socket.io internals): after `new Server(httpServer, …)`,
   capture socket.io's 'request' listeners, remove them, install a dispatcher that answers internal
   routes first and forwards socket traffic (urls like `/?EIO=4&transport=polling`) to the original
   listeners. Verified through the real gateway (:81 with `XTransformPort=3003`) for both health and
   the engine.io handshake — browser pattern `io("/?XTransformPort=3003")` works end-to-end.
   Note: `GET /` is only served WITHOUT a query string (the socket handshake lives at `/?…`);
   `/health` and `/internal/*` work with or without query strings.

2. **Plain `nohup bun run dev … &` does NOT survive in this sandbox** — the Bash tool reaps the
   command's process tree when the command ends (also with disown, and with setsid+nohup on the
   wrapper). What works: launch the server as an orphaned, session-detached process so it reparents
   to init. The service is currently running this way.

## Start / stop / test (exact commands)

```bash
# start (persists across commands):
cd /home/z/my-project/mini-services/chat-service && ( setsid bun --hot index.ts > service.log 2>&1 < /dev/null & )
# verify:
sleep 1 && curl -s http://localhost:3003/health
# smoke test (18 checks):
cd /home/z/my-project/mini-services/chat-service && bun scripts/test-client.ts
# stop:
pkill -f "bun --hot index.ts"
```

`bun run dev` ≡ `bun --hot index.ts`, but the `bun run` wrapper's child gets reaped at command end
here — start the server process directly as above.

## Test results (final run against the live service)

18 passed, 0 failed (exit 0): health + counts, two-client websocket connect, hello→presence
broadcasts, typing relay + sender exclusion, /internal/emit → message:new to both room members,
presence:list ack, user-room notification (B gets it, A doesn't), agent typing endpoint,
empty-rooms emit → `{ok:true,sent:0}`, disconnect → offline broadcast + presence cleanup.
Graceful SIGTERM shutdown verified manually (logs + port freed), then restarted.

Gateway round-trip verified: `curl 'http://localhost:81/health?XTransformPort=3003'` → health JSON;
`curl 'http://localhost:81/?XTransformPort=3003&EIO=4&transport=polling'` → engine.io handshake.

## Integration notes for other agents

- Task 1-a: client connects `io("/?XTransformPort=3003", {transports:['websocket','polling'], reconnection:true})`;
  server side uses `src/lib/realtime-server.ts` (already matches `/internal/emit` + `/internal/typing`).
- Full work record also appended to `/home/z/my-project/worklog.md` (Task 1-b section).
- Nothing outside `mini-services/chat-service/` was modified (only worklog append + this record).
