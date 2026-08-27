# LifeOS

**Every inbox. One connection.** Connect all your Gmail and Outlook accounts, then give Claude, ChatGPT, or any MCP client a single secure connection to your entire email life.

LifeOS is a pass-through: it never stores email content. Convex holds only account records and encrypted OAuth tokens; every read/send goes live to Gmail / Microsoft Graph.

## Monorepo layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 dashboard + hosted MCP server (`/mcp`) + Convex backend |
| `apps/cli` | `lifeos` — the terminal app: everything the dashboard does, without a browser |
| `packages/core` | Provider-agnostic email layer (Gmail + Microsoft Graph clients, OAuth helpers) |
| `packages/mcp` | MCP tool definitions (search, read, send, draft, archive, labels…) |

## Architecture

- **Dashboard auth** — WorkOS AuthKit (`@workos-inc/authkit-nextjs`).
- **MCP auth** — AuthKit doubles as the OAuth 2.1 authorization server for MCP clients (dynamic client registration included). The MCP route verifies AuthKit JWTs via JWKS; `/.well-known/oauth-protected-resource` (RFC 9728) points clients at it.
- **Email providers** — per-user OAuth to Google/Microsoft; refresh tokens AES-256-GCM encrypted before storage in Convex.
- **MCP endpoint** — `https://<host>/mcp` (rewritten to `/api/mcp`, served by `mcp-handler`).
- **CLI auth** — WorkOS device authorization flow: `lifeos login` opens the browser straight to a pre-filled confirm page, then stores the session in the OS keychain. `/api/cli/v1/*` accepts either that access token or an API key (sha256-hashed at rest), so scripts and CI still work with `lifeos login --token`.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
```

1. **WorkOS** — create an app at dashboard.workos.com, enable AuthKit, set redirect URI `http://localhost:3000/callback`. Copy client id / API key / AuthKit domain into `.env.local`. For MCP auth, enable Connect/MCP support on your AuthKit domain (Authentication → Connect).
2. **Convex** — `cd apps/web && npx convex dev` (creates the deployment, fills `CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL`, generates typed bindings). Then `npx convex env set LIFEOS_SERVICE_KEY <value from .env.local>`.
3. **Google** — Cloud Console → OAuth consent screen (External, scope `https://mail.google.com/`) → Web credentials with redirect `http://localhost:3000/api/connect/google/callback`. While in "Testing" mode add yourself as a test user.
4. **Microsoft** — Entra app registration (accounts in any org + personal), delegated permissions `Mail.ReadWrite Mail.Send User.Read offline_access`, redirect `http://localhost:3000/api/connect/microsoft/callback`.
5. Generate secrets: `openssl rand -base64 32` for `WORKOS_COOKIE_PASSWORD` and `LIFEOS_ENCRYPTION_KEY`, `openssl rand -hex 32` for `LIFEOS_SERVICE_KEY`.

## Run

```bash
pnpm dev                # dashboard on :3000 (+ keep `npx convex dev` running)
```

Connect an inbox at `http://localhost:3000/dashboard`, then add the MCP connection:

```bash
claude mcp add -t http lifeos http://localhost:3000/mcp
```

## CLI

```bash
npm i -g @cognify-software/lifeos
lifeos login          # opens your browser; nothing to paste
lifeos                # the full-screen app
```

Bare `lifeos` takes over the terminal: a rail down the left, and every screen the
dashboard has — inboxes (add, rename, reconnect, add calendar, disconnect), the MCP endpoint, API keys,
and a `doctor` that actually calls each provider instead of trusting the stored
status. `tab` moves between the rail and the pane, `?` lists the keys.

Everything also works non-interactively, for scripts and CI:

```bash
lifeos accounts list --json
lifeos accounts add gmail                     # opens the browser to authorize
lifeos accounts add icloud --email you@icloud.com  # prompts for the app password
lifeos accounts rename you@gmail.com work     # name it; omit the name to undo
lifeos accounts calendar you@icloud.com       # add calendar to an inbox — no password
lifeos mcp install --client claude-code
lifeos keys create ci
lifeos doctor                                 # exits non-zero if anything is broken
lifeos login --token lifeos_...               # CI: no browser needed
```

The iCloud app-specific password is read from a no-echo prompt. In CI, where
there's no terminal to prompt on, pass it as `LIFEOS_ICLOUD_PASSWORD` — not as
`--password`, which shell history keeps and any process on the box can read out
of the process table.

Updates come from npm. The app checks once a day and offers the upgrade in the
footer; `u` installs it, or run `lifeos update`.

From this checkout instead of npm:

```bash
pnpm --filter @cognify-software/lifeos build
node apps/cli/dist/cli.js login --api-url http://localhost:3000
```

## Deploy

Deploy `apps/web` to Vercel (root directory `apps/web`, Turborepo detected automatically). Set every env var from `.env.example` (with production URLs), run `npx convex deploy`, and update the Google/Microsoft/WorkOS redirect URIs to the production domain.

Two secrets carry the whole security model, so generate them fresh per deployment and don't reuse them: `LIFEOS_SERVICE_KEY` is the only thing gating your (publicly reachable) Convex functions, and `LIFEOS_ENCRYPTION_KEY` decrypts every stored refresh token.

## Contributing

Setup is above; conventions and the pre-PR checks are in [CONTRIBUTING.md](CONTRIBUTING.md), with the full style guide in [AGENTS.md](AGENTS.md).

Found a security issue? Please report it privately — see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE).
