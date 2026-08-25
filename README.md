# LifeOS

**Every inbox. One connection.** Connect all your Gmail and Outlook accounts, then give Claude, ChatGPT, or any MCP client a single secure connection to your entire email life.

LifeOS is a pass-through: it never stores email content. Convex holds only account records and encrypted OAuth tokens; every read/send goes live to Gmail / Microsoft Graph.

## Monorepo layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 dashboard + hosted MCP server (`/mcp`) + Convex backend |
| `apps/cli` | `lifeos` CLI — login, accounts, status, MCP setup info |
| `packages/core` | Provider-agnostic email layer (Gmail + Microsoft Graph clients, OAuth helpers) |
| `packages/mcp` | MCP tool definitions (search, read, send, draft, archive, labels…) |

## Architecture

- **Dashboard auth** — WorkOS AuthKit (`@workos-inc/authkit-nextjs`).
- **MCP auth** — AuthKit doubles as the OAuth 2.1 authorization server for MCP clients (dynamic client registration included). The MCP route verifies AuthKit JWTs via JWKS; `/.well-known/oauth-protected-resource` (RFC 9728) points clients at it.
- **Email providers** — per-user OAuth to Google/Microsoft; refresh tokens AES-256-GCM encrypted before storage in Convex.
- **MCP endpoint** — `https://<host>/mcp` (rewritten to `/api/mcp`, served by `mcp-handler`).
- **CLI auth** — API keys minted in the dashboard (sha256-hashed at rest).

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
npm i -g @cognify-software/lifeos             # or, from this checkout:
pnpm --filter @cognify-software/lifeos build
node apps/cli/dist/index.js login    # or `pnpm link` it as `lifeos`
lifeos accounts
lifeos mcp
```

## Deploy

Deploy `apps/web` to Vercel (root directory `apps/web`, Turborepo detected automatically). Set every env var from `.env.example` (with production URLs), run `npx convex deploy`, and update the Google/Microsoft/WorkOS redirect URIs to the production domain.
