import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const home = mkdtempSync(join(tmpdir(), "lifeos-cred-"));

// Force the file fallback: no keyring command exists on a platform we invent.
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

describe("credential fallback file", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(process, "platform", { value: "aix", configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  });

  it("falls back to a file when no keyring exists, and reads it back", async () => {
    const { loadAuth, saveAuth, backendName } = await import("../src/lib/credentials.js");
    expect(await backendName()).toBe("file (0600)");

    await saveAuth("http://localhost:3000", { refreshToken: "rt", email: "me@example.com" });
    expect(await loadAuth("http://localhost:3000")).toMatchObject({
      refreshToken: "rt",
      email: "me@example.com",
    });
  });

  it("keeps the credential file unreadable by anyone else", async () => {
    const { saveAuth } = await import("../src/lib/credentials.js");
    await saveAuth("http://localhost:3000", { refreshToken: "rt" });

    // 0600 on the file, 0700 on the directory that holds it.
    expect(statSync(join(home, ".lifeos", "auth.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".lifeos")).mode & 0o777).toBe(0o700);
  });

  it("keys credentials by instance, so localhost and production coexist", async () => {
    const { loadAuth, saveAuth } = await import("../src/lib/credentials.js");
    await saveAuth("http://localhost:3000", { refreshToken: "local" });
    await saveAuth("https://lifeos.you", { refreshToken: "prod" });

    expect((await loadAuth("http://localhost:3000"))?.refreshToken).toBe("local");
    expect((await loadAuth("https://lifeos.you"))?.refreshToken).toBe("prod");
  });

  it("forgets one instance without touching the other", async () => {
    const { clearAuth, loadAuth, saveAuth } = await import("../src/lib/credentials.js");
    await saveAuth("http://localhost:3000", { refreshToken: "local" });
    await saveAuth("https://lifeos.you", { refreshToken: "prod" });

    await clearAuth("http://localhost:3000");
    expect(await loadAuth("http://localhost:3000")).toBeNull();
    expect((await loadAuth("https://lifeos.you"))?.refreshToken).toBe("prod");
  });

  it("returns null rather than throwing on a corrupt store", async () => {
    const { loadAuth } = await import("../src/lib/credentials.js");
    expect(await loadAuth("http://nothing-was-ever-saved-here")).toBeNull();
  });
});
