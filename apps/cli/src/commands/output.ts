/** Plain ANSI for the non-interactive commands, which never mount Ink. */
const wrap = (code: string) => (s: string) => (color() ? `\x1b[${code}m${s}\x1b[0m` : s);

function color(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export const dim = wrap("2");
export const bold = wrap("1");
export const green = wrap("32");
export const yellow = wrap("33");
export const red = wrap("31");
export const indigo = wrap("38;5;141");

export function print(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export function json(value: unknown): void {
  print(JSON.stringify(value, null, 2));
}

/** Report and exit non-zero. Every command funnels failures through here. */
export function fail(message: string): never {
  process.stderr.write(`${red("✗")} ${message}\n`);
  process.exit(1);
}

/**
 * Read a secret from the terminal without echoing it.
 *
 * The alternative is a `--password` flag, which puts the secret in argv: saved
 * to shell history, and readable by anything that can list the process table.
 * The prompt goes to stderr so `--json` stdout stays clean and pipeable.
 *
 * Rejects when there is no TTY to prompt on — callers fall back to an env var
 * so CI still has a way through.
 */
export function promptSecret(label: string): Promise<string> {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) return Promise.reject(new Error("not a tty"));

  return new Promise<string>((resolve) => {
    let value = "";
    stderr.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const finish = (result: string | null) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stderr.write("\n");
      // Ctrl-C mid-prompt should quit, not hand back a half-typed secret.
      if (result === null) process.exit(130);
      resolve(result);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(value);
        if (ch === "\u0003") return finish(null);
        // Backspace / delete. Nothing was echoed, so nothing to erase on screen.
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };

    stdin.on("data", onData);
  });
}

export const STATUS_MARK: Record<string, string> = {
  active: green("●"),
  needs_reauth: yellow("●"),
  disconnected: dim("○"),
};
