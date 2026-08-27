import { describe, expect, it } from "vitest";
import { accountName, accountNames, calendarOwners, defaultAccountName } from "../src/types";

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

describe("calendar owners", () => {
  const icloud = (email: string, over: Record<string, unknown> = {}) => ({
    provider: "icloud" as const,
    email,
    loginEmail: "mason@icloud.com",
    status: "active" as const,
    connectedAt: 100,
    ...over,
  });

  it("leaves an account that owns its own calendar out of the map", () => {
    const owners = calendarOwners([
      { provider: "gmail", email: "one@gmail.com" },
      { provider: "gmail", email: "two@gmail.com" },
    ]);
    expect(owners.size).toBe(0);
  });

  it("points every alias at one owner, so a calendar is listed once", () => {
    const owners = calendarOwners([
      icloud("mason@cognify.design", { connectedAt: 200 }),
      icloud("mason@picka.college", { connectedAt: 100 }),
      icloud("support@picka.college", { connectedAt: 300 }),
    ]);
    // The oldest sibling owns it; the sign-in address itself isn't connected.
    expect(owners.get("mason@cognify.design")).toBe("mason@picka.college");
    expect(owners.get("support@picka.college")).toBe("mason@picka.college");
    expect(owners.has("mason@picka.college")).toBe(false);
  });

  it("prefers the sign-in address when it is one of the connected accounts", () => {
    const owners = calendarOwners([
      icloud("alias@cognify.design", { connectedAt: 100 }),
      icloud("mason@icloud.com", { loginEmail: undefined, connectedAt: 300 }),
    ]);
    expect(owners.get("alias@cognify.design")).toBe("mason@icloud.com");
  });

  it("hands the calendar to an account that still works", () => {
    const owners = calendarOwners([
      icloud("mason@icloud.com", { loginEmail: undefined, status: "needs_reauth" }),
      icloud("alias@cognify.design", { connectedAt: 400 }),
    ]);
    expect(owners.get("mason@icloud.com")).toBe("alias@cognify.design");
  });

  it("keeps two different sign-ins apart", () => {
    const owners = calendarOwners([
      icloud("a@one.test"),
      icloud("b@one.test"),
      icloud("c@two.test", { loginEmail: "other@icloud.com" }),
    ]);
    expect(owners.get("b@one.test")).toBe("a@one.test");
    expect(owners.has("c@two.test")).toBe(false);
  });
});
