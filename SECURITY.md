# Security

LifeOS holds OAuth tokens for people's email accounts. A vulnerability here
reads someone's inbox, so please report anything you find rather than opening a
public issue.

## Reporting

Use [GitHub's private vulnerability reporting][advisory] on this repository.
That opens a private thread with the maintainers and gives you a CVE if one is
warranted.

[advisory]: https://github.com/mason50x/life-os/security/advisories/new

If that isn't working for you, email **security@cognify.software** instead.

Expect an acknowledgement within 3 working days and an assessment within 10.
If a fix is needed you'll get an ETA, and credit in the advisory unless you'd
rather not have it.

Please give us a chance to ship a fix before disclosing publicly. We won't
pursue anyone acting in good faith under this policy.

## Scope

In scope, roughly in order of how much we care:

- Anything that reads or sends mail for an account that isn't yours.
- Anything that leaks OAuth tokens, API keys, or the `LIFEOS_SERVICE_KEY` —
  including through logs or error messages.
- Auth bypass on the MCP endpoint (`/mcp`), `/api/cli/*`, or the dashboard.
- Token decryption without the encryption key, or weaknesses in how tokens are
  encrypted at rest.
- Convex functions reachable without a valid service key or AuthKit JWT.
- Privilege escalation between users, or between an API key and its owner.

Out of scope:

- Vulnerabilities in WorkOS, Convex, Google, or Microsoft. Report those to them.
- Findings against a self-hosted instance that stem from its own configuration
  (a weak `LIFEOS_SERVICE_KEY`, a leaked `.env.local`, a permissive OAuth app).
- Missing hardening headers, or reports with no demonstrated impact.
- Automated scanner output pasted without a working proof of concept.
- Social engineering, physical attacks, and denial of service.

## Supported versions

The latest release of `@cognify-software/lifeos` and the current `main` branch.
Older versions don't get backported fixes.

## If you self-host

A LifeOS deployment is only as private as its secrets:

- `LIFEOS_SERVICE_KEY` is the sole thing between the internet and your users'
  encrypted tokens — every Convex `query`/`mutation` in this repo checks it, and
  your Convex deployment URL is public by design. Generate it with
  `openssl rand -hex 32` and never reuse it across deployments.
- `LIFEOS_ENCRYPTION_KEY` decrypts every stored refresh token. Losing it
  disconnects every account; leaking it exposes all of them.
- Rotating either means re-setting it in both Vercel and Convex
  (`npx convex env set`). Rotating the encryption key invalidates stored tokens,
  so users have to reconnect.
- Keep the Google and Microsoft OAuth apps' redirect URIs pinned to hosts you
  control.
