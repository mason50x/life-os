# Releasing the CLI

The `lifeos` command ships to npm as **`@cognify-software/lifeos`**. Everything after
the one-time setup is automatic: push a commit that touches `apps/cli`, and
`.github/workflows/publish-cli.yml` bumps the version, tags it, and publishes.

The package name and the command name are separate. `npm i -g @cognify-software/lifeos`
installs a binary called `lifeos` — the unscoped `lifeos` name on npm belongs
to an unrelated project.

## One-time setup

These need your npm account, so they can't be scripted.

**1. Claim the scope.**

There is no `npm org create` — the CLI only has `org set|rm|ls`. Orgs are made
in the browser at [npmjs.com/org/create](https://www.npmjs.com/org/create);
pick the free plan, which covers unlimited public packages.

```bash
npm login
npm org ls cognify-software         # confirms the org exists and you own it
```

**2. Publish v0.1.0 by hand.**

Trusted publishing is configured per package, and the settings page doesn't
exist until the package does — so the first release has to be a manual one.

This account has 2FA set to `auth-and-writes`, so npm will ask for a one-time
code. That prompt is why this step can't be automated or handed to an agent.

```bash
pnpm --filter @cognify-software/lifeos build
cd apps/cli && npm publish --access public
```

**3. Turn on trusted publishing.**

On npmjs.com → `@cognify-software/lifeos` → Settings → Trusted Publisher → GitHub
Actions:

| Field | Value |
|---|---|
| Organization or user | `mason50x` |
| Repository | `life-os` |
| Workflow filename | `publish-cli.yml` |
| Environment | *(leave blank)* |

From then on the workflow authenticates with a short-lived OIDC token. There
is no `NPM_TOKEN` secret in this repo, and nothing to rotate. npm also attaches
[provenance](https://docs.npmjs.com/generating-provenance-statements) to every
release automatically, so the listing shows which commit and workflow built it.

The account's `auth-and-writes` 2FA does **not** block this. npm detects the
OIDC environment and accepts the signed short-lived token in place of an OTP —
only the manual publish in step 2 prompts for a code.

Optional hardening, once it's working: the package's publishing-access
settings have a *"Require two-factor authentication and disallow tokens"*
mode, which refuses token-based publishes outright and leaves OIDC as the only
way in. Worth turning on — but only after a green run, since it removes the
manual fallback.

**4. Let Actions push.**

GitHub → repo Settings → Actions → General → Workflow permissions →
**Read and write**. The job pushes the version bump commit and its tag.

**5. Push, last.**

Do the four steps above *before* pushing this branch to `main`. The push
touches `apps/cli`, so it triggers the workflow — which needs the package to
exist and the trusted publisher to be configured, or it fails at the publish
step. (Nothing is left behind when it fails: the job publishes before it
pushes the version commit, so a failed publish means no bad tag lands.)

That first push releases `0.1.1`, which is the proof the pipeline works.

## After that

Push to `main`. If the commit touched `apps/cli`, it releases.

The bump comes from the commit message:

| Commit starts with | Bump |
|---|---|
| `major:` — or `BREAKING CHANGE` anywhere in the body | major |
| `feat:` or `minor:` | minor |
| anything else | patch |

The workflow commits the new version back as `Release @cognify-software/lifeos vX.Y.Z
[skip ci]` and tags it `cli-vX.Y.Z`. The `[skip ci]` is what stops that commit
from triggering another release.

To cut a release without touching the CLI — or to force a specific bump — run
the workflow by hand from the Actions tab and pick the level.

## Checking before you push

```bash
pnpm --filter @cognify-software/lifeos build
cd apps/cli && npm pack --dry-run
```

That prints exactly what would ship. It should be `dist/` and the manifest,
nothing else — `files` in `package.json` is what limits it.
