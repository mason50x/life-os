import { afterEach, describe, expect, it, vi } from "vitest";

// Keep the registry check off the real filesystem — it caches into ~/.lifeos.
vi.mock("../src/lib/config.js", () => ({
  readConfig: () => ({ apiUrl: "https://lifeos.you" }),
  updateConfig: () => ({ apiUrl: "https://lifeos.you" }),
}));

const { checkForUpdate, isNewer, latestVersion, updateCommand } = await import(
  "../src/lib/update.js"
);

describe("isNewer", () => {
  it("compares numerically, not lexically", () => {
    expect(isNewer("0.10.0", "0.9.0")).toBe(true);
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
    expect(isNewer("0.2.0", "0.10.0")).toBe(false);
  });

  it("never reports an update for the version already running", () => {
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.1.9", "0.2.0")).toBe(false);
  });

  it("ignores prerelease suffixes rather than choking on them", () => {
    expect(isNewer("0.3.0-rc.1", "0.2.0")).toBe(true);
    expect(isNewer("0.2.0-rc.1", "0.2.0")).toBe(false);
  });

  it("tolerates short versions", () => {
    expect(isNewer("1.1", "1.0.9")).toBe(true);
  });
});

describe("updateCommand", () => {
  it("installs globally for every package manager", () => {
    for (const installer of ["npm", "pnpm", "yarn", "bun"] as const) {
      const [cmd, args] = updateCommand(installer);
      expect(cmd).toBe(installer);
      expect(args.join(" ")).toContain("@cognify-software/lifeos@latest");
      expect(args.join(" ")).toMatch(/-g|global/);
    }
  });
});

describe("latestVersion", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Regression: `/latest` 406s on the abbreviated-packument media type — that
   * one only exists on the full packument. The check read the 406 as "registry
   * unreachable" and reported "up to date" for the CLI's whole life.
   */
  it("asks the registry for something it will actually answer", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const accept = (init?.headers as Record<string, string>)?.accept ?? "";
      if (accept.includes("vnd.npm.install-v1")) {
        return { ok: false, status: 406, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ version: "0.2.3" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await latestVersion(true)).toBe("0.2.3");
    expect(await checkForUpdate("0.2.2", true)).toBe("0.2.3");
    expect(fetchMock).toHaveBeenCalled();
  });
});
