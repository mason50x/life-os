# Contributing

Thanks for looking. LifeOS is a small monorepo and the setup is fully
documented, so getting to a running dashboard should take about fifteen
minutes.

Found a security issue? Don't open an issue — see [SECURITY.md](SECURITY.md).

## Getting set up

`README.md` has the whole path: the four accounts you need (WorkOS, Convex,
Google Cloud, Microsoft Entra), which env vars each one fills in, and how to
generate the secrets. Work through it before filing a "won't boot" issue —
almost every startup failure is a missing or mismatched env var.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
pnpm dev
```

Agent skills for Convex aren't checked in (they're third-party). If you want
them: `cd apps/web && npx convex ai-files install`.

## Before you open a PR

```bash
pnpm typecheck
pnpm test
pnpm build
```

All three should be clean. `pnpm test` covers the CLI (unit plus Ink render
tests); there's no test suite for the web app yet, so exercise dashboard
changes by hand and say what you clicked.

(`pnpm lint` currently runs nothing — the turbo task exists but no package
implements it yet. Wiring up a linter would be a welcome PR.)

## Conventions

`AGENTS.md` at the repo root is the real style guide — layout, conventions, and
the rules that apply everywhere. The short version:

- Keep changes small and in the style of the file you're editing.
- Hero icons (`@heroicons/react`) for anything new. Some files still import
  `lucide-react`; convert them when you touch them, don't add new ones.
- Ask first before adding a dependency, renaming a public route, or changing an
  auth flow. Those are the three things most likely to get a PR sent back.
- Comments should explain why, not what.

## Things worth knowing

- **Convex functions are internet-reachable.** Every `query`/`mutation` in
  `apps/web/convex` takes a `serviceKey` and calls `assertServiceKey`, or
  authenticates the caller via `ctx.auth`. A new function needs one or the
  other — there is no third option, and the deployment URL is public.
- **CLI-facing routes** under `app/api/cli/v1/` must call `resolveCliUser` and
  return `cliUnauthorized()` on null. The one deliberate exception is
  `v1/config`, which serves public bootstrap data.
- **Secrets never go in argv.** They end up in shell history and the process
  table. Prompt via `promptSecret`, or read an env var.
- **LifeOS never stores email content.** It's a pass-through: the database
  holds account records and encrypted tokens, nothing else. A change that
  caches message bodies is a change to the product's core promise, so raise it
  as an issue first.

## Releases

The CLI publishes to npm from `main` via GitHub Actions using npm trusted
publishing — see [RELEASING.md](RELEASING.md). The commit message picks the
version bump (`feat:` for minor, `major:` or a `BREAKING CHANGE` body for
major, anything else patch). Maintainers handle this; contributors don't need
to bump versions.

## Licence

Contributions are accepted under the [MIT Licence](LICENSE), same as the rest
of the project.
