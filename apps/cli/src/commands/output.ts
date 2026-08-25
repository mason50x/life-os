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

export const STATUS_MARK: Record<string, string> = {
  active: green("●"),
  needs_reauth: yellow("●"),
  disconnected: dim("○"),
};
