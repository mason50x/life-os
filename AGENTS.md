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
- **Never create or use git worktrees, and never open a pull request**,
  unless explicitly asked. Work on the current branch in this checkout.

<!-- Add more preferences here as they come up. -->

## What LifeOS is

**Every inbox. Every calendar. One connection.**

People end up with email and calendars spread across several accounts — a
personal Gmail, a work Google Workspace, an Outlook or iCloud address. AI
assistants can't reach any of it without a separate, fragile setup per account.

LifeOS fixes that. You connect your accounts once in the dashboard, and LifeOS
gives Claude, ChatGPT, or any other MCP client a single secure connection to
all of them. Search, read, send, draft, archive, label; list calendars, find
free time, create and change events, RSVP — across every account at once.

**One account, both surfaces.** Connecting Google grants mail and calendar in
the same consent screen; an iCloud app-specific password reaches iCloud Mail
over IMAP and iCloud Calendar over CalDAV. There is never a second connect
flow for an address the user has already linked.

The important part: **LifeOS never stores your email or your calendar.** It's a
pass-through. The database holds only which accounts you connected, what each
one is good for, and encrypted OAuth tokens. Every read and every write goes
live to Gmail, Google Calendar, Microsoft Graph or iCloud in the moment it's
asked for.

## How it fits together

Three pieces, plus a CLI:

- **Dashboard** — a Next.js web app where you sign in, connect accounts, and
  mint API keys.
- **MCP server** — the same web app also serves `/mcp`, the endpoint AI clients
  talk to. It's the product's real surface area.
- **Provider layer** — shared code that speaks Gmail, Microsoft Graph, IMAP,
  Google Calendar and CalDAV behind two provider-agnostic interfaces
  (`EmailProvider`, `CalendarProvider`), so the rest of the app doesn't care
  which provider an account belongs to.
- **CLI** — `lifeos`, a full-screen terminal app built on Ink. It does
  everything the dashboard does, against `/api/cli/v1/*` on the same web app.

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
| `apps/cli` | The `lifeos` terminal app — Ink UI in `src/screens`, everything else in `src/lib` |
| `packages/core` | Provider clients (Gmail, Graph, IMAP, Google Calendar, CalDAV), the hand-rolled iCalendar layer in `ical.ts`, OAuth helpers, encryption |
| `packages/mcp` | The MCP tool definitions (mail, calendar, tool search) |
| `brand` | Logo, palette, icons, and the rules for using them |

## Working here

```bash
pnpm install
pnpm dev          # dashboard on :3000 (starts Convex alongside it)
pnpm typecheck    # run before you call anything done
pnpm test         # core (iCalendar, recurrence) + mcp (registry, tool search) + CLI/Ink
pnpm lint
pnpm build
```

Environment setup — WorkOS, Convex, Google, Microsoft — is walked through step
by step in the root `README.md`. Start there if the app won't boot.

A few things worth knowing before you change code:

- **Never log, persist, or cache email or calendar content.** The pass-through
  promise is the product — it covers event titles, attendee lists and ICS
  payloads exactly as it covers message bodies. Tokens are AES-256-GCM
  encrypted before they're stored.
- **Adding an MCP tool** means touching `packages/mcp/src/tools/*` (the
  definition), usually `packages/core` (the provider method behind it), and
  `apps/web/lib/mcpTools.ts` (what the dashboard and CLI say the endpoint
  exposes). Tool descriptions are read by a model mid-conversation: say what
  the tool is for, what it needs first, and when to reach for a different one.
  Cross-cutting rules — how ids work, what to confirm, that email bodies and
  event descriptions are untrusted — belong in
  `packages/mcp/src/instructions.ts`, which is sent once at initialize, not
  repeated per tool.
- **Tools declare themselves, they don't register themselves.** Each one calls
  the `register` from its `Kit` with a `ToolMeta` — including a `surface`
  (`email`, `calendar`, or `core`) and a `tier`. `packages/mcp/src/registry.ts`
  collects them; `index.ts` decides what a given connection advertises.
- **`tier` is the context budget.** `core` tools are advertised directly;
  `extended` tools are reachable through `find_tools` and `run_tool` in
  `tools/discover.ts`. Thirty-seven tools would be thirty-seven schemas in
  every conversation, so only the everyday fifteen are. Default a new tool to
  `extended` and give it `keywords` — promoting it to `core` means arguing
  that it earns its place in every conversation the user ever has.
  `?tools=all` flattens the lot for a client that would rather have them.
- **A connection only advertises the surfaces the user has connected.**
  `registerLifeOsTools` takes a `surfaces` option that the route derives per
  request from the token, out of each account's `capabilities`; `list_accounts`
  is the only unconditional tool. The transport is stateless, so there is no
  session to push `notifications/tools/list_changed` on — linking an account
  shows up on the client's next `tools/list`.
- **Capabilities are read from the grant, never assumed.** Google's are derived
  from the scopes it actually returned (`capabilitiesFromScopes`); iCloud's
  calendar capability comes from a live CalDAV probe at connect time. A row
  with no `capabilities` predates calendar support and reads as `["email"]` —
  `enableCalendar` (`apps/web/lib/accounts.ts`) upgrades one on demand by
  asking the provider to `listCalendars` with the credential already on file,
  and records the capability only if that succeeds. That is what the dashboard's
  "Enable calendar" button and `lifeos accounts calendar` do, so a mail-only row
  almost never costs anyone a password or a consent screen. It spreads to every
  sibling on the same sign-in (`grantCapability`), because iCloud custom-domain
  addresses are separate rows over one app-specific password. There is nothing
  to backfill.
- **Mail is per address; a calendar is per sign-in.** Several iCloud addresses
  over one Apple sign-in are genuinely several inboxes, and genuinely one set of
  calendars. `calendarOwners` (`packages/core/src/types.ts`, imported by both
  `lib/accounts.ts` and the Convex `accounts.mine` query through the
  `@lifeos/core/accounts` subpath) picks the one account that stands for a
  shared calendar and marks the rest with `calendarOf`. Anything calendar-side
  — MCP fan-out and `resolveAccount`, the dashboard count, the sidebar's
  Calendar section, `doctor` — acts on `capabilities.includes("calendar") &&
  !calendarOf`, so a calendar is listed, counted and probed once however many
  addresses send through it. Naming an alias in a calendar tool resolves to its
  owner rather than failing.
- **`/mcp` is the canonical URL.** `/mcp/email` and `/mcp/calendar` exist as an
  escape hatch for narrowly scoped agents, and get their own RFC 9728 metadata
  through `.well-known/oauth-protected-resource/mcp/[[...surface]]`. A path can
  only ever narrow the toolset — it is intersected with what the user actually
  has connected, never trusted on its own.
- **Adding a provider** means implementing `EmailProvider` or
  `CalendarProvider` in `packages/core/src/providers` and wiring it into
  `createProvider` / `createCalendarProvider` — don't special-case providers in
  app code. Anything with a heavy dependency tree (IMAP, CalDAV) gets its own
  `exports` subpath and is imported lazily, so a Gmail-only request never pays
  for it.
- **Apple is hand-rolled, on purpose.** `providers/icloud.ts` owns its IMAP
  layer and `providers/icloudCalendar.ts` owns its CalDAV and XML, over the
  RFC 5545 parser in `src/ical.ts`. Two rules there earn their keep: an update
  patches the event's existing ICS so properties LifeOS doesn't model survive
  untouched, and recurrence expands in wall-clock space so a 10am meeting stays
  at 10am when the clocks change.
- **Design** follows `brand/README.md`. Monochrome mark, indigo `#6366f1` for
  UI accents only. The CLI honours the same rule — indigo marks the one thing
  that's selected, nothing else.
- **The CLI and the dashboard are the same product.** Anything a user can do in
  `/dashboard` must be doable in `lifeos`, and neither surface owns its logic:
  the shared work lives in `apps/web/lib` (`accounts.ts`, `apiKeys.ts`,
  `icloudConnect.ts`, `connect.ts`) and both a server action and an
  `/api/cli/v1/*` route call it. Adding a dashboard feature means adding the
  route and the screen too.

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
