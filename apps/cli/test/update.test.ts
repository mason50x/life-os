import { describe, expect, it } from "vitest";
import { isNewer, updateCommand } from "../src/lib/update.js";

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
