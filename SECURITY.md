# Security Policy 🔒

Flack Chat ships authentication (sessions), TOTP two-factor auth, API keys,
file uploads, a Slack-compatible API layer, and two socket.io services — all
surfaces we care deeply about keeping safe.

## 📌 Supported Versions

Flack Chat is under active development on a single line. Please always test
against the latest `main` before reporting.

| Version | Supported          |
|---------|--------------------|
| `main` (latest) | ✅ Yes |
| older commits / tagged archives | ❌ No — re-test on `main` first |

## 🐞 Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately:

1. **Preferred:** use GitHub's *Report a vulnerability* form
   (**Security → Advisories → Report** on the repository), **or**
2. Email **security@flack.test** with the details.

### What to include

- A clear description of the issue and the affected component
  (API route path, component, mini-service, etc.)
- Step-by-step reproduction instructions or a proof-of-concept
- The impact you believe the issue has (what an attacker could achieve)
- Affected browser / OS, if relevant

### What to expect

| Stage | Target |
|---|---|
| Acknowledgment of your report | within **48 hours** |
| Initial triage & severity rating | within **5 days** |
| Fix or mitigation timeline | communicated per severity (critical items prioritized) |

We will keep you informed of progress toward a fix and credit you in the
advisory (unless you prefer to remain anonymous). Please give us a reasonable
window to remediate before any public disclosure.

## 🎯 Scope

The following areas are of particular interest:

- **Authentication & sessions** — login flow, 2FA (RFC 6238 TOTP + recovery
  codes), session creation/revocation, the `flack_session` cookie flags
- **API keys** — generation, hashing, and auth via the `flack_`-prefixed keys
  (including the Slack-compatible layer and MCP endpoints)
- **Authorization** — access control on private channels, DMs, admin routes
  (`/api/admin/*`), and cross-user resource access
- **File uploads** — path traversal, content-type validation, size limits,
  serving of stored files (`/api/files/*`, custom emoji images)
- **Rendering** — XSS in markdown, code blocks, mentions, emoji, connector
  cards, or any message content rendered into the DOM
- **Realtime services** — authorization on the socket.io gateway
  (chat-service :3003) and scheduler-service (:3004)
- **Migration tooling** — Slack export/import handling of untrusted archives

### Out of scope

- Attacks requiring access to the server's filesystem or database file directly
  (the SQLite file and `uploads/` are trusted local state)
- Missing rate limiting / brute-force protections on **demo deployments** —
  known limitation of the reference setup; harden your reverse proxy in
  production
- Denial-of-service, spam, or social-engineering reports
- Issues in seeded demo accounts (`*@flack.test`, password `demo1234`) — these
  are intentionally public demo credentials
- Dependency CVEs with no plausible code path into this application (do still
  open a normal issue so we can bump the dependency)

## 🛡️ Security best practices for self-hosters

If you deploy Flack Chat beyond your local machine:

1. **Change every demo password** and disable/limit `/api/auth/demo` (one-click
   demo login) before exposing the app to others.
2. **Generate fresh API keys** — never reuse keys from a public fork or archive.
3. **Do not expose ports 3003 / 3004 directly** — the mini-services trust the
   network boundary; keep them internal and proxy through your gateway.
4. **Serve over HTTPS** (e.g. behind Caddy/nginx) so session cookies and API
   keys are never sent in cleartext.
5. Keep the database file and `uploads/` outside any static-file-served path.

## 🔐 Cryptography notes

- Passwords: salted **scrypt** (64-byte derived key, timing-safe comparison)
- 2FA: **RFC 6238 TOTP** (SHA-1, 6 digits, 30-second step) with hashed seeds;
  recovery codes shown once and stored SHA-256-hashed
- API keys: high-entropy random with a `flack_` prefix; only the hash is stored
- Sessions: opaque 256-bit random tokens in an `httpOnly` · `SameSite=Lax`
  cookie, revocable per-device in Settings → Security. Tokens are stored in the
  database as-is — protect DB file access accordingly, and when serving over
  HTTPS, enable the cookie `secure` flag (it is off by default because the
  reference setup runs behind a plain-HTTP gateway)

Thank you for helping keep Flack Chat and its users safe! 🙏
