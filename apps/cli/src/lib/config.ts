import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".lifeos");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/**
 * Non-secret preferences only. Credentials live in the OS keychain (see
 * credentials.ts) and never touch this file.
 */
export interface CliConfig {
  /** Which LifeOS instance this machine talks to. */
  apiUrl: string;
  /** Cached npm registry answer. A known-newer version is trusted for a day. */
  update?: { checkedAt: number; latest: string };
}

export const DEFAULT_API_URL = process.env.LIFEOS_API_URL ?? "https://lifeos.you";

/** 0700 — the fallback credential file may end up in here. */
export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function readConfig(): CliConfig {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<CliConfig>;
    return { ...parsed, apiUrl: normalizeUrl(parsed.apiUrl ?? DEFAULT_API_URL) };
  } catch {
    return { apiUrl: DEFAULT_API_URL };
  }
}

export function writeConfig(config: CliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function updateConfig(patch: Partial<CliConfig>): CliConfig {
  const next = { ...readConfig(), ...patch };
  writeConfig(next);
  return next;
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
