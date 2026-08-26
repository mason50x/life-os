import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig, updateConfig } from "./config.js";

export const PACKAGE_NAME = "@cognify-software/lifeos";
/** How long a registry answer is trusted, so launch never waits on the network. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Numeric-segment comparison, ignoring any prerelease suffix. Enough for a
 * package that only ever publishes x.y.z, and it never claims an update when
 * versions match.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.split("-")[0]!.split(".").map((n) => Number(n) || 0);
  const [a, b] = [parts(candidate), parts(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Latest published version, cached for a day. Returns null when the registry
 * is unreachable — an update check is never worth a visible failure.
 */
export async function latestVersion(force = false): Promise<string | null> {
  const config = readConfig();
  if (!force && config.update && Date.now() - config.update.checkedAt < CACHE_TTL_MS) {
    return config.update.latest;
  }
  try {
    // Plain JSON: the abbreviated-packument type this used to ask for is only
    // served on the full packument, so `/latest` answered every request with a
    // 406 and the check silently never fired.
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return config.update?.latest ?? null;
    const { version } = (await res.json()) as { version: string };
    updateConfig({ update: { checkedAt: Date.now(), latest: version } });
    return version;
  } catch {
    return config.update?.latest ?? null;
  }
}

export async function checkForUpdate(current: string, force = false): Promise<string | null> {
  const latest = await latestVersion(force);
  return latest && isNewer(latest, current) ? latest : null;
}

export type Installer = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Which package manager put this binary here. Global install roots are
 * recognisable from the path, and guessing wrong means the update installs a
 * second copy that shadows nothing.
 */
export function detectInstaller(): Installer {
  const here = fileURLToPath(import.meta.url);
  if (here.includes("/.bun/") || here.includes("\\.bun\\")) return "bun";
  if (/[/\\]pnpm[/\\]/.test(here)) return "pnpm";
  if (/[/\\]\.yarn[/\\]|[/\\]yarn[/\\]/.test(here)) return "yarn";
  return "npm";
}

export function updateCommand(installer: Installer = detectInstaller()): [string, string[]] {
  const spec = `${PACKAGE_NAME}@latest`;
  switch (installer) {
    case "pnpm":
      return ["pnpm", ["add", "-g", spec]];
    case "yarn":
      return ["yarn", ["global", "add", spec]];
    case "bun":
      return ["bun", ["add", "-g", spec]];
    case "npm":
      return ["npm", ["install", "-g", spec]];
  }
}

/** Run the update, streaming output so a slow install doesn't look like a hang. */
export function runUpdate(onOutput: (line: string) => void): Promise<void> {
  const [cmd, args] = updateCommand();
  onOutput(`$ ${cmd} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    const emit = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) if (line.trim()) onOutput(line.trimEnd());
    };
    child.stdout?.on("data", emit);
    child.stderr?.on("data", emit);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}
