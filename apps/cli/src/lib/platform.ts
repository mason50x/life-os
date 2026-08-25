import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Open a URL in the default browser. Hand-rolled rather than pulled from a
 * package: every option ships a fallback binary alongside its JavaScript, and
 * those break the moment the CLI is bundled into a single file.
 */
export async function openBrowser(url: string): Promise<boolean> {
  if (!canOpenBrowser()) return false;
  const [cmd, args] =
    process.platform === "darwin"
      ? (["open", [url]] as const)
      : process.platform === "win32"
        ? (["cmd", ["/c", "start", "", url]] as const)
        : (["xdg-open", [url]] as const);
  try {
    // Detached so a browser that holds the terminal open doesn't block us.
    const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether there's plausibly a browser to open. Over SSH or in a container
 * there isn't, and the caller should print a code instead of pretending.
 */
export function canOpenBrowser(): boolean {
  if (process.env.LIFEOS_NO_BROWSER) return false;
  if (process.env.SSH_TTY || process.env.SSH_CONNECTION) return false;
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }
  return true;
}

/** Copy to the system clipboard. Same reasoning as openBrowser. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];

  for (const [cmd, args] of candidates) {
    const copied = await new Promise<boolean>((resolve) => {
      const child = execFile(cmd, args, (error) => resolve(!error));
      child.stdin?.end(text);
      child.on("error", () => resolve(false));
    });
    if (copied) return true;
  }
  return false;
}

export async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await run(process.platform === "win32" ? "where" : "which", [cmd]);
    return true;
  } catch {
    return false;
  }
}
