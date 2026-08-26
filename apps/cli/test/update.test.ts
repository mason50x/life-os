import { afterEach, describe, expect, it, vi } from "vitest";

type UpdateCache = { checkedAt: number; latest: string };

const { state } = vi.hoisted(() => ({
  state: {
    config: { apiUrl: "https://lifeos.you" } as {
      apiUrl: string;
      update?: UpdateCache;
    },
  },
}));

// Keep the registry check off the real filesystem — it caches into ~/.lifeos.
vi.mock("../src/lib/config.js", () => ({
  readConfig: () => state.config,
  updateConfig: (patch: { update?: UpdateCache }) => {
    state.config = { ...state.config, ...patch };
    return state.config;
  },
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
  afterEach(() => {
    vi.unstubAllGlobals();
    state.config = { apiUrl: "https://lifeos.you" };
  });

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

  it("still hits the registry when the cache says you're already on latest", async () => {
    state.config.update = { checkedAt: Date.now(), latest: "0.2.4" };
    const fetchMock = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => ({ version: "0.2.5" }) }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkForUpdate("0.2.4")).toBe("0.2.5");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("reuses a cached newer version so launch does not wait on the network", async () => {
    state.config.update = { checkedAt: Date.now(), latest: "0.2.5" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkForUpdate("0.2.4")).toBe("0.2.5");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
