import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { Accounts } from "../src/screens/Accounts.js";
import { Keys } from "../src/screens/Keys.js";
import { Layout } from "../src/ui/Layout.js";
import type { LifeOsClient } from "../src/lib/api.js";
import type { LiveClient } from "../src/lib/live.js";
import type { Account, ApiKey } from "../src/lib/types.js";

const CREATED = "lifeos_shownonce123";

// The App shell is exercised below; stub what it reaches for on mount.
vi.mock("../src/lib/api.js", () => ({
  LifeOsClient: class {
    accounts = async () => [];
    keys = async () => KEYS;
    createKey = async () => ({ key: CREATED });
    mcp = async () => ({ url: "http://localhost:4999/mcp", tools: [], reaches: [] });
  },
}));
vi.mock("../src/lib/auth.js", () => ({
  currentCredential: async () => ({ identity: { email: "you@example.com" } }),
  signOut: async () => {},
}));
vi.mock("../src/lib/update.js", () => ({
  checkForUpdate: async () => null,
  runUpdate: async () => {},
}));

const { App } = await import("../src/app.js");

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

/** A LiveClient the test drives by hand: push a list, the screen re-renders. */
function stubLive() {
  let accountsCb: ((accounts: Account[]) => void) | null = null;
  let keysCb: ((keys: ApiKey[]) => void) | null = null;
  const live: LiveClient = {
    onAccounts: (cb) => {
      accountsCb = cb;
      return () => {
        accountsCb = null;
      };
    },
    onKeys: (cb) => {
      keysCb = cb;
      return () => {
        keysCb = null;
      };
    },
    close: async () => {},
  };
  return {
    live,
    pushAccounts: (accounts: Account[]) => accountsCb?.(accounts),
    pushKeys: (keys: ApiKey[]) => keysCb?.(keys),
  };
}

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

  it("keeps the rail's labels in a narrow terminal", () => {
    const { lastFrame } = render(<Layout columns={60} rows={24} {...props} />);
    expect(lastFrame()).toContain("Accounts");
    expect(lastFrame()).toContain("MCP");
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
    expect(lastFrame()).toContain("Add an account");
    expect(lastFrame()).toContain("iCloud");
  });

  it("shows an inbox by name, and renames it on `n`", async () => {
    const rename = vi.fn(async () => ({ email: "one@gmail.com" }));
    const { lastFrame, stdin } = render(
      <Accounts client={stubClient({ renameAccount: rename })} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).toContain("one "); // the name, with the address beside it
    stdin.write("n");
    await settle();
    expect(lastFrame()).toContain("Rename");
    stdin.write("Work");
    await settle();
    stdin.write("\r");
    await settle();
    expect(rename).toHaveBeenCalledWith("a1", "Work");
  });

  it("ignores keys when the rail has focus instead of the pane", async () => {
    const { lastFrame, stdin } = render(<Accounts client={stubClient()} focused={false} height={20} />);
    await settle();
    stdin.write("a");
    await settle();
    expect(lastFrame()).not.toContain("Add an account");
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

  it("adds calendar on `e` with the credential the server already has", async () => {
    const enable = vi.fn(async () => ({ enabled: ["one@gmail.com"] }));
    const { lastFrame, stdin } = render(
      <Accounts client={stubClient({ enableCalendar: enable })} focused height={20} />,
    );
    await settle();
    // The offer has to be visible before it's worth pressing.
    expect(lastFrame()).toContain("press e to add calendar");
    stdin.write("e");
    await settle();
    expect(enable).toHaveBeenCalledWith("a1");
    expect(lastFrame()).toContain("Calendar on for one@gmail.com.");
  });

  it("points at reconnect only when the stored credential can't reach the calendar", async () => {
    const enable = vi.fn(async () => {
      throw new Error("This Google account was connected without the calendar permission.");
    });
    const { lastFrame, stdin } = render(
      <Accounts client={stubClient({ enableCalendar: enable })} focused height={20} />,
    );
    await settle();
    stdin.write("e");
    await settle();
    expect(lastFrame()).toContain("Press r to reconnect it.");
  });

  it("says so plainly when there is nothing connected", async () => {
    const { lastFrame } = render(
      <Accounts client={stubClient({ accounts: async () => [] })} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).toContain("Nothing connected yet");
  });

  it("follows the live subscription without a keypress", async () => {
    const feed = stubLive();
    const { lastFrame } = render(
      <Accounts client={stubClient()} live={feed.live} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).not.toContain("three@icloud.com");
    // Someone connects an inbox in the dashboard; Convex pushes the new list.
    feed.pushAccounts([
      ...ACCOUNTS,
      { id: "a3", userId: "u", provider: "icloud", email: "three@icloud.com", status: "active", connectedAt: Date.parse("2026-08-27T12:00:00Z") },
    ]);
    await settle();
    expect(lastFrame()).toContain("three@icloud.com");
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

  it("follows the live subscription when a key is revoked elsewhere", async () => {
    const feed = stubLive();
    const { lastFrame } = render(
      <Keys client={stubClient()} live={feed.live} focused height={20} />,
    );
    await settle();
    expect(lastFrame()).toContain("CI");
    feed.pushKeys([]);
    await settle();
    expect(lastFrame()).toContain("you probably don't need one");
  });

  // Regression: the shell used to remount every screen whenever one reported a
  // change, which wiped the reveal a frame after it appeared.
  it("keeps the revealed key on screen after telling the shell about it", async () => {
    const { lastFrame, stdin } = render(<App apiUrl="http://localhost:4999" version="0.0.0" />);
    await settle();
    stdin.write("\u001B"); // esc — focus the rail
    await settle();
    stdin.write("\u001B[B"); // ↓ MCP
    await settle();
    stdin.write("\u001B[B"); // ↓ Keys
    await settle();
    stdin.write("\r");
    await settle();
    stdin.write("n");
    await settle();
    stdin.write("laptop");
    await settle();
    stdin.write("\r");
    await settle();
    await settle();
    expect(lastFrame()).toContain(CREATED);
  });
});
