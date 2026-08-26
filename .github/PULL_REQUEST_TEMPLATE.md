## What this changes

<!-- And why. Link the issue if there is one. -->

## How you tested it

<!-- Commands you ran, or what you clicked through in the dashboard. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` are clean
- [ ] No secrets in the diff — no keys, tokens, `.env` values, or real inbox contents in fixtures and screenshots
- [ ] New Convex functions call `assertServiceKey` or authenticate via `ctx.auth`
- [ ] New `/api/cli/v1/*` routes call `resolveCliUser`
- [ ] Read `AGENTS.md` if this is your first change here

<!--
Changing an auth flow, a public route name, or adding a dependency? Please
raise it as an issue first — see CONTRIBUTING.md.
-->
