import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { CONFIG_DIR, ensureConfigDir } from "./config.js";

const run = promisify(execFile);

/** What the CLI is signed in with. Either a WorkOS session or an API key. */
export interface StoredAuth {
  /** From the device authorization flow. Rotated on every refresh. */
  refreshToken?: string;
  accessToken?: string;
  /** Unix ms expiry of `accessToken`. */
  expiresAt?: number;
  /** `lifeos_…`, when signed in with `login --token` for CI. */
  apiKey?: string;
  email?: string;
  userId?: string;
}

export type Backend = "macOS keychain" | "libsecret" | "Windows DPAPI" | "file (0600)";

const SERVICE = "lifeos";
const FILE_PATH = join(CONFIG_DIR, "auth.json");

/**
 * Resolved once per process. Every backend is driven through its own CLI rather
 * than a native module: node-gyp failures during a global install are exactly
 * the friction this CLI is trying not to have.
 */
let resolved: Backend | null = null;

async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await run(process.platform === "win32" ? "where" : "which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function detectBackend(): Promise<Backend> {
  if (resolved) return resolved;
  if (process.platform === "darwin" && (await hasCommand("security"))) resolved = "macOS keychain";
  else if (process.platform === "linux" && (await hasCommand("secret-tool"))) resolved = "libsecret";
  else if (process.platform === "win32" && (await hasCommand("powershell")))
    resolved = "Windows DPAPI";
  else resolved = "file (0600)";
  return resolved;
}

/** Which store is actually in use, for the Settings screen to be honest about. */
export async function backendName(): Promise<Backend> {
  return detectBackend();
}

// --- macOS -----------------------------------------------------------------
// The secret goes through argv, which is briefly visible to other processes on
// this machine. `security` has no stdin mode for writes; every keychain-backed
// CLI makes the same trade, and the alternative is not using the keychain.

async function macosSet(account: string, secret: string) {
  await run("security", [
    "add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", secret,
  ]);
}
async function macosGet(account: string): Promise<string | null> {
  try {
    const { stdout } = await run("security", [
      "find-generic-password", "-s", SERVICE, "-a", account, "-w",
    ]);
    return stdout.trim() || null;
  } catch {
    return null; // exit 44 = no such item
  }
}
async function macosDelete(account: string) {
  await run("security", ["delete-generic-password", "-s", SERVICE, "-a", account]).catch(() => {});
}

// --- Linux (libsecret) -----------------------------------------------------
// `secret-tool store` reads the secret from stdin, so nothing lands in argv.

function secretToolStore(account: string, secret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "secret-tool",
      ["store", "--label=LifeOS", "service", SERVICE, "account", account],
      (error) => (error ? reject(error) : resolve()),
    );
    child.stdin?.end(secret);
  });
}
async function linuxGet(account: string): Promise<string | null> {
  try {
    const { stdout } = await run("secret-tool", ["lookup", "service", SERVICE, "account", account]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
async function linuxDelete(account: string) {
  await run("secret-tool", ["clear", "service", SERVICE, "account", account]).catch(() => {});
}

// --- Windows (DPAPI) -------------------------------------------------------
// No credential-manager CLI ships with Windows, so encrypt with the user's DPAPI
// key and keep the ciphertext on disk. The secret travels via the environment
// rather than argv, which other users cannot read.

/** One file per instance, named by a hash so the URL never hits the filesystem. */
function dpapiPath(account: string): string {
  return join(CONFIG_DIR, `auth.${createHash("sha256").update(account).digest("hex").slice(0, 16)}.dpapi`);
}

async function powershell(script: string, secret?: string): Promise<string> {
  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { env: { ...process.env, ...(secret ? { LIFEOS_SECRET: secret } : {}) } },
  );
  return stdout.trim();
}

async function windowsSet(account: string, secret: string) {
  ensureConfigDir();
  const cipher = await powershell(
    "Add-Type -AssemblyName System.Security;" +
      "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect(" +
      "[Text.Encoding]::UTF8.GetBytes($env:LIFEOS_SECRET),$null,'CurrentUser'))",
    secret,
  );
  writeFileSync(dpapiPath(account), cipher, { mode: 0o600 });
}
async function windowsGet(account: string): Promise<string | null> {
  let cipher: string;
  try {
    cipher = readFileSync(dpapiPath(account), "utf8").trim();
  } catch {
    return null;
  }
  try {
    return await powershell(
      "Add-Type -AssemblyName System.Security;" +
        "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect(" +
        `[Convert]::FromBase64String('${cipher}'),$null,'CurrentUser'))`,
    );
  } catch {
    return null;
  }
}

// --- Fallback file ---------------------------------------------------------

function fileSet(account: string, secret: string) {
  ensureConfigDir();
  const all = fileReadAll();
  all[account] = secret;
  writeFileSync(FILE_PATH, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  // writeFileSync's mode only applies when creating; enforce it on rewrites too.
  chmodSync(FILE_PATH, 0o600);
}
function fileReadAll(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(FILE_PATH, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

// --- Public API ------------------------------------------------------------

/**
 * Credentials are keyed by instance URL, so a developer signed into localhost
 * and into production at once doesn't clobber one with the other.
 */
export async function saveAuth(account: string, auth: StoredAuth): Promise<void> {
  const secret = JSON.stringify(auth);
  try {
    switch (await detectBackend()) {
      case "macOS keychain":
        return await macosSet(account, secret);
      case "libsecret":
        return await secretToolStore(account, secret);
      case "Windows DPAPI":
        return await windowsSet(account, secret);
      case "file (0600)":
        return fileSet(account, secret);
    }
  } catch {
    // A keyring that exists but won't answer (locked, no session bus, no
    // signing identity) must not make the CLI unusable.
    resolved = "file (0600)";
    fileSet(account, secret);
  }
}

export async function loadAuth(account: string): Promise<StoredAuth | null> {
  const backend = await detectBackend();
  let raw: string | null = null;
  try {
    if (backend === "macOS keychain") raw = await macosGet(account);
    else if (backend === "libsecret") raw = await linuxGet(account);
    else if (backend === "Windows DPAPI") raw = await windowsGet(account);
  } catch {
    raw = null;
  }
  // Always consider the file too: it may hold a credential written back when
  // the keyring was unavailable.
  raw ??= fileReadAll()[account] ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export async function clearAuth(account: string): Promise<void> {
  const backend = await detectBackend();
  if (backend === "macOS keychain") await macosDelete(account);
  if (backend === "libsecret") await linuxDelete(account);
  if (backend === "Windows DPAPI") rmSync(dpapiPath(account), { force: true });

  const all = fileReadAll();
  delete all[account];
  if (Object.keys(all).length === 0) {
    rmSync(FILE_PATH, { force: true });
  } else {
    writeFileSync(FILE_PATH, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
    chmodSync(FILE_PATH, 0o600);
  }
}
