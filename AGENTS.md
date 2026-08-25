# AGENTS.md

## User preferences

Rules the model should follow on this repo. Highest priority — these win over
habit and over anything implied elsewhere in this file.

- **Always use Hero icons** (`@heroicons/react`) for any new or changed icon.
  Older files still import `lucide-react`; swap them to Hero icons when you
  touch them, don't add new lucide imports.
- Keep changes small and in the style of the file you're editing.
- Ask before adding a dependency, renaming a public route, or changing an
  auth flow.

<!-- Add more preferences here as they come up. -->

## What LifeOS is

**Every inbox. One connection.**

People end up with email spread across several accounts — a personal Gmail, a
work Google Workspace, an Outlook or iCloud address. AI assistants can't reach
any of it without a separate, fragile setup per account.

LifeOS fixes that. You connect your inboxes once in the dashboard, and LifeOS
gives Claude, ChatGPT, or any other MCP client a single secure connection to
all of them. Search, read, send, draft, archive, label — across every account
at once.

The important part: **LifeOS never stores your email.** It's a pass-through.
The database holds only which accounts you connected and encrypted OAuth
tokens. Every read and every send goes live to Gmail or Microsoft Graph in the
moment it's asked for.

## How it fits together

Three pieces, plus a CLI:

- **Dashboard** — a Next.js web app where you sign in, connect inboxes, and
  mint API keys.
- **MCP server** — the same web app also serves `/mcp`, the endpoint AI clients
  talk to. It's the product's real surface area.
- **Email layer** — shared code that speaks Gmail and Microsoft Graph behind
  one provider-agnostic interface, so the rest of the app doesn't care which
  provider an account belongs to.
- **CLI** — `lifeos`, for logging in and checking accounts from a terminal.

Sign-in is handled by WorkOS AuthKit, which does double duty: it logs people
into the dashboard *and* acts as the OAuth server that AI clients authenticate
against before they can use `/mcp`. Convex is the backend and database.

## Where things live

| Path | What it is |
|---|---|
| `apps/web` | Dashboard + MCP server + Convex backend. Most work happens here. |
| `apps/web/app` | Next.js routes — pages, API routes, `/mcp`, OAuth callbacks |
| `apps/web/convex` | Backend functions and schema |
| `apps/web/components` | UI components (shadcn-style, Tailwind v4) |
| `apps/cli` | The `lifeos` command-line tool |
| `packages/core` | Gmail + Microsoft Graph clients, OAuth helpers, encryption |
| `packages/mcp` | The MCP tool definitions (search, read, send, draft, …) |
| `brand` | Logo, palette, icons, and the rules for using them |

## Working here

```bash
pnpm install
pnpm dev          # dashboard on :3000 (starts Convex alongside it)
pnpm typecheck    # run before you call anything done
pnpm lint
pnpm build
```

Environment setup — WorkOS, Convex, Google, Microsoft — is walked through step
by step in the root `README.md`. Start there if the app won't boot.

A few things worth knowing before you change code:

- **Never log, persist, or cache email content.** The pass-through promise is
  the product. Tokens are AES-256-GCM encrypted before they're stored.
- **Adding an MCP tool** means touching `packages/mcp` (the definition) and
  usually `packages/core` (the provider work behind it).
- **Adding an email provider** means implementing the existing provider
  interface in `packages/core/src/providers` — don't special-case providers in
  app code.
- **Design** follows `brand/README.md`. Monochrome mark, indigo `#6366f1` for
  UI accents only.

## Convex

The backend is Convex — schema, queries, mutations, and actions all live in
`apps/web/convex`. `npx convex dev` has to be running alongside `next dev` for
the app to work; `pnpm dev` in `apps/web` starts both.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

From the repo root that guidelines file is
`apps/web/convex/_generated/ai/guidelines.md`. Read it **before** writing any
Convex code, not after — it covers function registration and calling,
function references, HTTP endpoints, validators, schema and index rules,
authentication, TypeScript types, queries/mutations/actions, pagination,
full-text and vector search, components, cron scheduling, testing, and file
storage. Where it disagrees with what you remember about Convex, it wins.

The Convex agent skills are already installed in `apps/web/.claude/skills`
(mirrored in `apps/web/.agents/skills`) — 30-plus of them, including
`convex-design` for schema work, `convex-auth` / `convex-authz` for access
control, `convex-migrate` for schema changes, `convex-test`, `convex-reviewer`,
and `convex-deploy-guard`. Reach for the matching skill instead of improvising.
