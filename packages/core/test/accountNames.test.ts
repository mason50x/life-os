import { describe, expect, it } from "vitest";
import { accountName, accountNames, defaultAccountName } from "../src/types";

describe("account names", () => {
  it("defaults to the address without its domain", () => {
    expect(defaultAccountName("mason@gmail.com")).toBe("mason");
    expect(accountName({ email: "mason@icloud.com" })).toBe("mason");
  });

  it("prefers the name the user gave it", () => {
    expect(accountName({ email: "mason@gmail.com", nickname: "Work" })).toBe("Work");
    // Whitespace isn't a name, so it falls through to the default.
    expect(accountName({ email: "mason@gmail.com", nickname: "  " })).toBe("mason");
  });

  it("falls back to full addresses when two defaults would read the same", () => {
    const names = accountNames([{ email: "mason@gmail.com" }, { email: "mason@icloud.com" }]);
    expect(names.get("mason@gmail.com")).toBe("mason@gmail.com");
    expect(names.get("mason@icloud.com")).toBe("mason@icloud.com");
  });

  it("leaves a renamed account alone, and frees the default for the other", () => {
    const names = accountNames([
      { email: "mason@gmail.com", nickname: "Work" },
      { email: "mason@icloud.com" },
    ]);
    expect(names.get("mason@gmail.com")).toBe("Work");
    expect(names.get("mason@icloud.com")).toBe("mason");
  });
});
