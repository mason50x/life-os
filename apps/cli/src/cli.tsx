import { Command } from "commander";
import { render } from "ink";
import { App } from "./app.js";
import { banner } from "./banner.js";
import * as cmd from "./commands/index.js";
import { resolveApiUrl } from "./commands/index.js";
import { fail } from "./commands/output.js";
import pkg from "../package.json";

const version: string = pkg.version;

/**
 * Take over the terminal on the alternate screen, so quitting leaves the
 * scrollback exactly as it was found.
 */
async function interactive(apiUrl?: string): Promise<void> {
  process.stdout.write("\x1b[?1049h\x1b[H");
  const restore = () => process.stdout.write("\x1b[?1049l");
  process.on("exit", restore);
  try {
    const app = render(<App apiUrl={resolveApiUrl(apiUrl)} version={version} />, {
      exitOnCtrlC: false,
    });
    await app.waitUntilExit();
  } finally {
    process.off("exit", restore);
    restore();
  }
}

/**
 * Commander hands an action `(...positionals, options, command)`, and resolves
 * a flag against the command that declared it — so `--api-url`, declared once
 * on the program, never reaches a subcommand's own options. optsWithGlobals
 * merges the chain, which is what every command here actually wants.
 */
type Opts = Record<string, string | boolean | undefined>;
function act<A extends unknown[]>(
  handler: (...args: [...A, Opts]) => Promise<unknown> | unknown,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const command = args.at(-1) as Command;
    await handler(...([...args.slice(0, -2), command.optsWithGlobals()] as [...A, Opts]));
  };
}

const program = new Command();

program
  .name("lifeos")
  .description("LifeOS — every inbox, one MCP connection")
  .version(version)
  // Declared once, here: every subcommand picks it up through optsWithGlobals.
  .option("--api-url <url>", "LifeOS instance to talk to")
  .addHelpText("beforeAll", `${banner()}\n`)
  .action((opts: { apiUrl?: string }) => {
    // Rendering a full-screen app into a pipe produces escape-code soup; a
    // non-interactive caller wanted a command, so show them the commands.
    if (!process.stdout.isTTY) return program.help();
    return interactive(opts.apiUrl);
  });

program
  .command("logo", { hidden: true })
  .description("Print the LifeOS logo")
  .action(() => console.log(banner()));

program
  .command("login")
  .description("Sign in through your browser")
  .option("--token <key>", "Sign in with a LifeOS API key instead (for CI)")
  .action(act(cmd.login));

program
  .command("logout")
  .description("Forget this machine's credentials")
  .action(act((o: Opts) => cmd.logout(o.apiUrl as string | undefined)));

program
  .command("whoami")
  .description("Who this machine is signed in as")
  .option("--json", "Machine-readable output")
  .action(act(cmd.whoami));

program
  .command("status")
  .description("Instance, inbox count, MCP endpoint")
  .option("--json", "Machine-readable output")
  .action(act(cmd.status));

program
  .command("doctor")
  .description("Check every inbox and the MCP endpoint")
  .option("--json", "Machine-readable output")
  .action(act(cmd.doctor));

program
  .command("update")
  .description("Install the latest version from npm")
  .action(() => cmd.update(version));

const accounts = program.command("accounts").description("Connected inboxes");
accounts
  .command("list", { isDefault: true })
  .description("List connected inboxes")
  .option("--json", "Machine-readable output")
  .action(act(cmd.accountsList));
accounts
  .command("add <provider>")
  .description("Connect an inbox: gmail, outlook, or icloud")
  .option("--email <address>", "iCloud only")
  .option("--password <app-password>", "iCloud only — an app-specific password")
  .option("--send-as <addresses>", "iCloud only — alias addresses, space separated")
  .action(act(cmd.accountsAdd));
accounts
  .command("remove <email>")
  .description("Disconnect an inbox")
  .action(act(cmd.accountsRemove));

const mcp = program.command("mcp").description("MCP endpoint");
mcp
  .command("url", { isDefault: true })
  .description("Print the MCP endpoint")
  .option("--json", "Machine-readable output")
  .option("--copy", "Also copy it to the clipboard")
  .action(act(cmd.mcpUrl));
mcp
  .command("install")
  .description("Add the endpoint to an MCP client")
  .option("--client <name>", "which client to install into", "claude-code")
  .action(act(cmd.mcpInstall));

const keys = program.command("keys").description("API keys for scripts and CI");
keys
  .command("list", { isDefault: true })
  .description("List API keys")
  .option("--json", "Machine-readable output")
  .action(act(cmd.keysList));
keys
  .command("create <name>")
  .description("Mint a key — shown once")
  .option("--json", "Machine-readable output")
  .action(act(cmd.keysCreate));
keys
  .command("revoke <prefix>")
  .description("Revoke a key by prefix or name")
  .action(act(cmd.keysRevoke));

program.parseAsync().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
