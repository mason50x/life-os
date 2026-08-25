import { LifeOsClient, NotSignedInError } from "../lib/api.js";
import {
  currentCredential,
  fetchInstanceConfig,
  pollForSession,
  signIn,
  signOut,
  startDeviceAuth,
} from "../lib/auth.js";
import { normalizeUrl, readConfig, updateConfig } from "../lib/config.js";
import { backendName } from "../lib/credentials.js";
import { canOpenBrowser, copyToClipboard, hasCommand, openBrowser } from "../lib/platform.js";
import { checkForUpdate, runUpdate } from "../lib/update.js";
import { PROVIDER_LABEL, type Provider } from "../lib/types.js";
import { bold, dim, fail, green, indigo, json, print, red, STATUS_MARK } from "./output.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Resolve the instance for this invocation: flag beats config beats default. */
export function resolveApiUrl(flag?: string): string {
  return flag ? normalizeUrl(flag) : readConfig().apiUrl;
}

export function clientFor(flag?: string): LifeOsClient {
  return new LifeOsClient(resolveApiUrl(flag));
}

/** Turn the one error everything shares into the one message that helps. */
async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof NotSignedInError) fail("Not signed in. Run `lifeos login`.");
    fail(e instanceof Error ? e.message : String(e));
  }
}

export async function login(opts: { apiUrl?: string; token?: string }): Promise<void> {
  const apiUrl = resolveApiUrl(opts.apiUrl);

  if (opts.token) {
    if (!/^lifeos_[a-f0-9]+$/.test(opts.token)) fail("That doesn't look like a LifeOS API key.");
    await signIn(apiUrl, { apiKey: opts.token });
    updateConfig({ apiUrl });
    const me = await guard(() => new LifeOsClient(apiUrl).me());
    print(`${green("✓")} Signed in with an API key. ${me.accounts} inbox(es) connected.`);
    return;
  }

  const { workosClientId } = await fetchInstanceConfig(apiUrl).catch((e: unknown) =>
    fail(e instanceof Error ? e.message : String(e)),
  );
  const grant = await startDeviceAuth(workosClientId).catch((e: unknown) =>
    fail(e instanceof Error ? e.message : String(e)),
  );

  const opened = canOpenBrowser() && (await openBrowser(grant.verificationUriComplete));
  if (opened) {
    print("Opening your browser to confirm the sign-in…");
    print(dim(`  If it didn't open: ${grant.verificationUri}  code ${grant.userCode}`));
  } else {
    print(`Open ${indigo(grant.verificationUri)} and enter the code ${bold(grant.userCode)}`);
  }
  print(dim("Waiting for confirmation…"));

  const session = await pollForSession(workosClientId, grant).catch((e: unknown) =>
    fail(e instanceof Error ? e.message : String(e)),
  );
  await signIn(apiUrl, session);
  updateConfig({ apiUrl });
  print(`${green("✓")} Signed in${session.email ? ` as ${session.email}` : ""}. Run ${bold("lifeos")}.`);
}

export async function logout(apiUrl?: string): Promise<void> {
  await signOut(resolveApiUrl(apiUrl));
  print(`${green("✓")} Signed out.`);
}

export async function whoami(opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const apiUrl = resolveApiUrl(opts.apiUrl);
  const credential = await currentCredential(apiUrl).catch(() => null);
  if (!credential) fail("Not signed in. Run `lifeos login`.");
  const me = await guard(() => new LifeOsClient(apiUrl).me());

  if (opts.json) {
    return json({ ...me, apiUrl, email: credential.identity?.email, auth: credential.kind });
  }
  print(`${bold(credential.identity?.email ?? me.userId)} ${dim(`via ${credential.kind === "apiKey" ? "API key" : "browser sign-in"}`)}`);
  print(`  instance     ${apiUrl}`);
  print(`  credentials  ${await backendName()}`);
  print(`  inboxes      ${me.accounts}`);
  print(`  api keys     ${me.keys}`);
}

export async function status(opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const me = await guard(() => client.me());
  if (opts.json) return json({ ...me, apiUrl: client.apiUrl });
  print(`${bold("LifeOS")} ${dim(client.apiUrl)}`);
  print(`  inboxes  ${me.accounts} connected`);
  print(`  mcp      ${indigo(me.mcpUrl)}`);
}

export async function accountsList(opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const accounts = await guard(() => client.accounts());
  if (opts.json) return json(accounts);
  if (accounts.length === 0) {
    return print(`No inboxes connected. Run ${bold("lifeos accounts add gmail")}.`);
  }
  for (const a of accounts) {
    print(`${STATUS_MARK[a.status] ?? "?"} ${bold(a.email)} ${dim(`(${PROVIDER_LABEL[a.provider]})`)}`);
  }
}

export async function accountsAdd(
  provider: string,
  opts: { apiUrl?: string; email?: string; password?: string; sendAs?: string },
): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const normalized = provider.toLowerCase() as Provider;

  if (normalized === "icloud") {
    if (!opts.email || !opts.password) {
      fail("iCloud needs --email and --password (an app-specific password).");
    }
    const { addresses } = await guard(() =>
      client.connectIcloud(opts.email!, opts.password!, opts.sendAs?.split(/[\s,;]+/).filter(Boolean) ?? []),
    );
    return print(`${green("✓")} Connected ${addresses.join(", ")}.`);
  }
  if (normalized !== "gmail" && normalized !== "outlook") {
    fail('Provider must be one of: gmail, outlook, icloud.');
  }

  const { url } = await guard(() => client.connectSession(normalized));
  const opened = canOpenBrowser() && (await openBrowser(url));
  print(opened ? "Opening your browser to authorize…" : `Open this to authorize:\n  ${indigo(url)}`);

  // Wait for it to land, so a script can chain the next step. A reconnect adds
  // no row and only flips the status, so watch both.
  const before = new Map(
    (await guard(() => client.accounts())).map((a) => [a.id, a.status] as const),
  );
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const now = await client.accounts().catch(() => null);
    const fresh = now?.find(
      (a) => !before.has(a.id) || (a.status === "active" && before.get(a.id) !== "active"),
    );
    if (fresh) return print(`${green("✓")} Connected ${fresh.email}.`);
  }
  fail("Timed out waiting for the browser.");
}

export async function accountsRemove(email: string, opts: { apiUrl?: string }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const accounts = await guard(() => client.accounts());
  const account = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!account) fail(`No connected inbox "${email}".`);
  await guard(() => client.removeAccount(account.id));
  print(`${green("✓")} Disconnected ${account.email}.`);
}

export async function doctor(opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const [accounts, mcp] = await guard(() => Promise.all([client.accounts(), client.mcp()]));

  const checks = await Promise.all([
    ...accounts.map((a) =>
      client
        .checkAccount(a.id)
        .catch((e: unknown) => ({
          email: a.email,
          ok: false,
          ms: 0,
          detail: e instanceof Error ? e.message : String(e),
        })),
    ),
    client.probeMcp(mcp.url).then((p) => ({ email: mcp.url, ok: p.ok, ms: 0, detail: p.detail })),
  ]);

  if (opts.json) return json(checks);
  for (const c of checks) {
    print(`${c.ok ? green("✓") : red("✗")} ${bold(c.email)} ${dim(c.detail)}`);
  }
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

export async function mcpUrl(opts: { apiUrl?: string; json?: boolean; copy?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const info = await guard(() => client.mcp());
  if (opts.json) return json(info);
  if (opts.copy) await copyToClipboard(info.url);
  print(info.url);
}

export async function mcpInstall(opts: { apiUrl?: string; client?: string }): Promise<void> {
  const api = clientFor(opts.apiUrl);
  const info = await guard(() => api.mcp());
  const target = opts.client ?? "claude-code";
  if (target !== "claude-code") {
    fail("Only --client claude-code can be installed automatically. Others: add the URL by hand.");
  }
  if (!(await hasCommand("claude"))) fail("The `claude` command isn't on your PATH.");
  await run("claude", ["mcp", "add", "-t", "http", "lifeos", info.url]);
  print(`${green("✓")} Added to Claude Code as ${bold("lifeos")}.`);
}

export async function keysList(opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const keys = await guard(() => client.keys());
  if (opts.json) return json(keys);
  if (keys.length === 0) return print("No API keys.");
  for (const k of keys) {
    print(`${bold(k.name)} ${dim(`${k.prefix}… · created ${new Date(k.createdAt).toISOString().slice(0, 10)}`)}`);
  }
}

export async function keysCreate(name: string, opts: { apiUrl?: string; json?: boolean }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const { key } = await guard(() => client.createKey(name));
  if (opts.json) return json({ key });
  print(key);
  process.stderr.write(`${dim("Stored nowhere — copy it now.")}\n`);
}

export async function keysRevoke(prefix: string, opts: { apiUrl?: string }): Promise<void> {
  const client = clientFor(opts.apiUrl);
  const keys = await guard(() => client.keys());
  const matches = keys.filter((k) => k.prefix.startsWith(prefix) || k.name === prefix);
  if (matches.length === 0) fail(`No key matching "${prefix}".`);
  if (matches.length > 1) fail(`"${prefix}" matches ${matches.length} keys — be more specific.`);
  await guard(() => client.revokeKey(matches[0]!._id));
  print(`${green("✓")} Revoked ${matches[0]!.name}.`);
}

export async function update(version: string): Promise<void> {
  const latest = await checkForUpdate(version, true);
  if (!latest) return print(`Already on the latest version (${version}).`);
  print(`Updating ${version} → ${latest}`);
  await runUpdate((line) => print(dim(line)));
  print(`${green("✓")} Updated.`);
}
