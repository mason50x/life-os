import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { Accounts } from "../src/screens/Accounts.js";
import { Keys } from "../src/screens/Keys.js";
import { Layout } from "../src/ui/Layout.js";
import type { LifeOsClient } from "../src/lib/api.js";
import type { Account, ApiKey } from "../src/lib/types.js";

const ACCOUNTS: Account[] = [
  { id: "a1", userId: "u", provider: "gmail", email: "one@gmail.com", status: "active", connectedAt: Date.parse("2026-08-03T12:00:00Z") },
  { id: "a2", userId: "u", provider: "outlook", email: "two@outlook.com", status: "needs_reauth", connectedAt: Date.parse("2026-06-14T12:00:00Z") },
];
const KEYS: ApiKey[] = [
  { _id: "k1", name: "CI", prefix: "lifeos_9f2a10", createdAt: Date.parse("2026-05-02T12:00:00Z") },
];

function stubClient(overrides: Partial<Record<keyof LifeOsClient, unknown>> = {}): LifeOsClient {
  return {
    apiUrl: "http://localhost:4999",
    accounts: async () => ACCOUNTS,
    keys: async () => KEYS,
    ...overrides,
  } as unknown as LifeOsClient;
}

/** Let queued microtasks and the screens' initial loads settle before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("Layout", () => {
  const props = {
    nav: [
      { key: "accounts", label: "Accounts" },
      { key: "mcp", label: "MCP" },
    ],
    current: "accounts",
    navFocused: false,
    instance: "lifeos.you",
    keys: "↑↓ move",
    children: <></>,
  };

  it("shows the rail's labels at a normal width", () => {
    const { lastFrame } = render(<Layout columns={120} rows={24} {...props} />);
    expect(lastFrame()).toContain("Accounts");
    expect(lastFrame()).toContain("lifeos.you");
  });

  it("collapses the rail to initials in a narrow terminal", () => {
    const { lastFrame } = render(<Layout columns={60} rows={24} {...props} />);
    expect(lastFrame()).not.toContain("Accounts");
    expect(lastFrame()).toContain("A");
  });

  it("offers the update in the footer only when there is one", () => {
    const plain = render(<Layout columns={120} rows={24} {...props} />);
    expect(plain.lastFrame()).toContain("? help");
    const updatable = render(<Layout columns={120} rows={24} {...props} updateAvailable="0.3.0" />);
    expect(updatable.lastFrame()).toContain("update 0.3.0");
  });
});

describe("Accounts", () => {
  it("lists every inbox with its real status", async () => {
    const { lastFrame } = render(<Accounts client={stubClient()} focused height={20} />);
    await settle();
    expect(lastFrame()).toContain("one@gmail.com");
    expect(lastFrame()).toContain("active");
    expect(lastFrame()).toContain("two@outlook.com");
    expect(lastFrame()).toContain("needs reauth");
  });

  it("opens the provider picker on `a`", async () => {
    const { lastFrame, stdin } = render(<Accounts client={stubClient()} focused height={20} />);
    await settle();
    stdin.write("a");
    await settle();
    expect(lastFrame()).toContain("Add an inbox");
    expect(lastFrame()).toContain("iCloud");
  });

  it("ignores keys when the rail has focus instead of the pane", async () => {
    const { lastFrame, stdin } = render(<Accounts client={stubClient()} focused={false} height={20} />);
    await settle();
    stdin.write("a");
    await settle();
    expect(lastFrame()).not.toContain("Add an inbox");
  });

  it("makes disconnect type the address out, not press a key", async () => {
    const remove = vi.fn();
    const { lastFrame, stdin } = render(
      <Accounts client={stubClient({ removeAccount: remove })} focused height={20} />,
    );
    await settle();
    stdin.write("d");
    await settle();
    expect(lastFrame()).toContain("one@gmail.com");
    stdin.write("\r"); // bare enter must not be enough
    await settle();
    expect(remove).not.toHaveBeenCalled();
  });

  it("says so plainly when there is nothing connected", async () => {
    const { lastFrame } = render(
      <Accounts client={stubClient({ accounts: async () => [] })} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).toContain("Nothing connected yet");
  });
});

describe("Keys", () => {
  it("steers people away from keys they don't need", async () => {
    const { lastFrame } = render(
      <Keys client={stubClient({ keys: async () => [] })} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).toContain("you probably don't need one");
  });

  it("reveals a new key once and says why", async () => {
    const created = "lifeos_abc123";
    const { lastFrame, stdin } = render(
      <Keys client={stubClient({ createKey: async () => ({ key: created }) })} focused height={20} />,
    );
    await settle();
    stdin.write("n");
    await settle();
    expect(lastFrame()).toContain("New API key");
    stdin.write("laptop");
    await settle();
    stdin.write("\r");
    await settle();
    expect(lastFrame()).toContain(created);
    expect(lastFrame()).toContain("no way to show this again");
  });
});
