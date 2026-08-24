#!/usr/bin/env node
import { Command } from "commander";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { banner } from "./banner.js";

const CONFIG_DIR = join(homedir(), ".lifeos");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface Config {
  apiUrl: string;
  apiKey: string;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const indigo = (s: string) => `\x1b[38;5;141m${s}\x1b[0m`;

function loadConfig(): Config | null {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return null;
  }
}

function requireConfig(): Config {
  const config = loadConfig();
  if (!config) {
    console.error(red("Not logged in.") + ` Run ${bold("lifeos login")} first.`);
    process.exit(1);
  }
  return config;
}

async function apiGet<T>(config: Config, path: string): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (res.status === 401) {
    console.error(red("API key rejected.") + ` Run ${bold("lifeos login")} with a fresh key.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(red(`API error ${res.status}: ${await res.text()}`));
    process.exit(1);
  }
  return (await res.json()) as T;
}

interface StatusResponse {
  userId: string;
  mcpUrl: string;
  accounts: { email: string; provider: string; status: string }[];
}

const program = new Command();

program
  .name("lifeos")
  .description("LifeOS — every inbox, one MCP connection")
  .version("0.1.0")
  .addHelpText("beforeAll", `${banner()}\n`);

program
  .command("logo", { hidden: true })
  .description("Print the LifeOS logo")
  .action(() => {
    console.log(banner());
  });

program
  .command("login")
  .description("Authenticate the CLI with a LifeOS API key")
  .option(
    "--api-url <url>",
    "LifeOS instance URL (use http://localhost:3000 for local dev)",
    process.env.LIFEOS_API_URL ?? "https://lifeos.you",
  )
  .action(async (opts: { apiUrl: string }) => {
    const apiUrl = opts.apiUrl.replace(/\/$/, "");
    console.log(`Create an API key in your dashboard: ${indigo(`${apiUrl}/dashboard`)}\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const apiKey = (await rl.question("Paste your API key (lifeos_...): ")).trim();
    rl.close();
    if (!/^lifeos_[a-f0-9]+$/.test(apiKey)) {
      console.error(red("That doesn't look like a LifeOS API key."));
      process.exit(1);
    }
    const config: Config = { apiUrl, apiKey };
    const status = await apiGet<StatusResponse>(config, "/api/cli/status");
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
    console.log(
      `\n${green("✓")} Logged in. ${status.accounts.length} account(s) connected.`,
    );
  });

program
  .command("logout")
  .description("Remove stored credentials")
  .action(() => {
    rmSync(CONFIG_PATH, { force: true });
    console.log(`${green("✓")} Logged out.`);
  });

program
  .command("accounts")
  .description("List connected email accounts")
  .action(async () => {
    const config = requireConfig();
    const { accounts } = await apiGet<{ accounts: StatusResponse["accounts"] }>(
      config,
      "/api/cli/accounts",
    );
    if (accounts.length === 0) {
      console.log(`No accounts connected. Add one at ${indigo(`${config.apiUrl}/dashboard`)}`);
      return;
    }
    for (const a of accounts) {
      const status = a.status === "active" ? green("●") : yellow("●");
      console.log(`${status} ${bold(a.email)} ${dim(`(${a.provider})`)}`);
    }
  });

program
  .command("status")
  .description("Show connection status and MCP endpoint")
  .action(async () => {
    const config = requireConfig();
    const status = await apiGet<StatusResponse>(config, "/api/cli/status");
    console.log(`${bold("LifeOS")} ${dim(config.apiUrl)}`);
    console.log(`  accounts  ${status.accounts.length} connected`);
    console.log(`  mcp       ${indigo(status.mcpUrl)}`);
  });

program
  .command("mcp")
  .description("Print MCP connection info for AI clients")
  .action(async () => {
    const config = requireConfig();
    const status = await apiGet<StatusResponse>(config, "/api/cli/status");
    console.log(`${bold("MCP endpoint:")} ${indigo(status.mcpUrl)}\n`);
    console.log(`${bold("Claude Code")}`);
    console.log(dim(`  claude mcp add -t http lifeos ${status.mcpUrl}`));
    console.log(`${bold("Claude (web/desktop)")}`);
    console.log(dim("  Settings → Connectors → Add custom connector"));
    console.log(`${bold("ChatGPT")}`);
    console.log(dim("  Settings → Connectors → Advanced → Developer mode"));
  });

program.parseAsync();
