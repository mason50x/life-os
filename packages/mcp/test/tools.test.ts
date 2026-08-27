import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CalendarProvider, ConnectedAccount, EmailProvider } from "@lifeos/core";
import { collectSpecs, jsonSchemaFor, specsFor, type ToolSpec } from "../src/registry";
import { registerLifeOsTools } from "../src/index";
import type { LifeOsSession, Surface } from "../src/session";
import type { ToolResult } from "../src/format";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const account = (over: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  id: "1",
  userId: "u",
  provider: "gmail",
  email: "a@example.com",
  status: "active",
  capabilities: ["email", "calendar"],
  connectedAt: 0,
  ...over,
});

function fakeSession(accounts: ConnectedAccount[] = [account()]): LifeOsSession {
  return {
    userId: "u",
    listAccounts: async () => accounts,
    providerFor: async () =>
      ({
        provider: "gmail",
        email: "a@example.com",
        listLabels: async () => [{ id: "INBOX", name: "Inbox" }],
      }) as unknown as EmailProvider,
    calendarFor: async () =>
      ({
        provider: "gmail",
        email: "a@example.com",
        listCalendars: async () => [
          { id: "primary", account: "a@example.com", provider: "gmail", name: "Personal" },
        ],
      }) as unknown as CalendarProvider,
  };
}

interface Registered {
  name: string;
  config: { description: string; inputSchema: z.ZodRawShape; annotations: Record<string, boolean> };
  handler: (args: never, extra: unknown) => Promise<ToolResult>;
}

/** Just enough McpServer to see what a connection would advertise. */
function fakeServer() {
  const tools: Registered[] = [];
  return {
    tools,
    server: {
      registerTool: (name: string, config: Registered["config"], handler: Registered["handler"]) => {
        tools.push({ name, config, handler });
      },
    },
  };
}

function register(surfaces: readonly Surface[], tools?: "auto" | "all") {
  const { tools: registered, server } = fakeServer();
  registerLifeOsTools(server as never, async () => fakeSession(), { surfaces, tools });
  return registered;
}

const names = (specs: ToolSpec[]) => specs.map((s) => s.name);
const body = (result: ToolResult) => result.content.map((c) => ("text" in c ? c.text : "")).join("");

// ---------------------------------------------------------------------------

describe("surface gating", () => {
  const all = collectSpecs(async () => fakeSession());

  it("shows nothing but list_accounts when nothing is connected", () => {
    expect(names(specsFor(all, []))).toEqual(["list_accounts"]);
  });

  it("keeps calendar tools away from a mail-only connection", () => {
    const specs = names(specsFor(all, ["email"]));
    expect(specs).toContain("search_emails");
    expect(specs).not.toContain("list_events");
    expect(specs).not.toContain("create_event");
  });

  it("keeps mail tools away from a calendar-only connection", () => {
    const specs = names(specsFor(all, ["calendar"]));
    expect(specs).toContain("list_events");
    expect(specs).not.toContain("search_emails");
    expect(specs).toContain("list_accounts");
  });

  it("gives every spec a unique name and a real tier", () => {
    expect(new Set(names(all)).size).toBe(all.length);
    expect(all.every((s) => s.tier === "core" || s.tier === "extended")).toBe(true);
    expect(all.every((s) => s.description.length > 40)).toBe(true);
  });
});

describe("tool search", () => {
  it("advertises a small core plus the two discovery tools", () => {
    const registered = register(["email", "calendar"]).map((t) => t.name);
    expect(registered).toContain("find_tools");
    expect(registered).toContain("run_tool");
    expect(registered).toContain("search_emails");
    expect(registered).toContain("list_events");
    // The long tail stays out of the client's context.
    expect(registered).not.toContain("list_drafts");
    expect(registered).not.toContain("respond_to_event");
    expect(registered.length).toBeLessThan(20);
  });

  it("registers everything directly when asked to", () => {
    const flat = register(["email", "calendar"], "all").map((t) => t.name);
    expect(flat).toContain("list_drafts");
    expect(flat).toContain("respond_to_event");
    expect(flat).not.toContain("find_tools");
    expect(flat.length).toBeGreaterThan(30);
  });

  it("skips the discovery pair when there is no long tail to search", () => {
    expect(register([]).map((t) => t.name)).toEqual(["list_accounts"]);
  });

  const findTools = async (query: string) => {
    const tool = register(["email", "calendar"]).find((t) => t.name === "find_tools")!;
    const result = await tool.handler({ query, all: false } as never, {});
    return (JSON.parse(body(result)) as { tools: { name: string }[] }).tools.map((t) => t.name);
  };

  it("ranks the right tool first for a question the core tools don't answer", async () => {
    expect((await findTools("how do I RSVP to this invitation"))[0]).toBe("respond_to_event");
    expect((await findTools("read the attachment on this message"))[0]).toBe("get_attachment");
    expect((await findTools("save a draft to review later"))[0]).toBe("create_draft");
    expect((await findTools("when am I free next week"))[0]).toBe("find_free_time");
    expect((await findTools("what labels exist"))[0]).toBe("list_labels");
  });

  it("returns the whole catalogue when asked for everything", async () => {
    const tool = register(["email", "calendar"]).find((t) => t.name === "find_tools")!;
    const result = JSON.parse(body(await tool.handler({ all: true } as never, {}))) as {
      tools: { name: string; input_schema: { type: string } }[];
    };
    expect(result.tools.length).toBeGreaterThan(30);
    expect(result.tools.every((t) => t.input_schema.type === "object")).toBe(true);
  });

  it("points at find_tools rather than failing silently on a miss", async () => {
    const tool = register(["email", "calendar"]).find((t) => t.name === "find_tools")!;
    const result = JSON.parse(
      body(await tool.handler({ query: "zzzz nonsense qqq", all: false } as never, {})),
    ) as { tools: unknown[]; next_step?: string };
    expect(result.tools).toEqual([]);
    expect(result.next_step).toContain("all: true");
  });
});

describe("run_tool", () => {
  const runTool = () => register(["email", "calendar"]).find((t) => t.name === "run_tool")!;

  it("runs a hidden tool for real", async () => {
    const result = await runTool().handler(
      { name: "list_labels", arguments: {} } as never,
      {},
    );
    expect(result.isError).toBeFalsy();
    expect(body(result)).toContain("INBOX");
  });

  it("names near matches instead of just refusing", async () => {
    const result = await runTool().handler({ name: "list_draft", arguments: {} } as never, {});
    expect(result.isError).toBe(true);
    expect(body(result)).toContain("list_drafts");
  });

  it("sends a model back to a directly-callable tool", async () => {
    const result = await runTool().handler({ name: "search_emails", arguments: {} } as never, {});
    expect(result.isError).toBe(true);
    expect(body(result)).toContain("call it directly");
  });

  it("reports which argument was wrong rather than throwing", async () => {
    const result = await runTool().handler(
      { name: "mark_read", arguments: { message_ids: "not-an-array" } } as never,
      {},
    );
    expect(result.isError).toBe(true);
    expect(body(result)).toContain("message_ids");
  });
});

describe("jsonSchemaFor", () => {
  it("converts the shapes the tools actually use", () => {
    const schema = jsonSchemaFor({
      account: z.string().optional().describe("Which account"),
      message_ids: z.array(z.string()).min(1),
      read: z.boolean().default(true),
      max_results: z.number().int().min(1).max(50).default(10),
      response: z.enum(["accepted", "declined"]),
      start: z.object({ date: z.string().optional() }),
    });

    expect(schema).toMatchObject({
      type: "object",
      properties: {
        account: { type: "string", description: "Which account" },
        message_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        read: { type: "boolean", default: true },
        max_results: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        response: { type: "string", enum: ["accepted", "declined"] },
        start: { type: "object", properties: { date: { type: "string" } } },
      },
    });
    // Optionals and defaults are not required; a bare field is.
    expect(schema.required).toEqual(["message_ids", "response", "start"]);
  });
});

describe("resolveAccount", () => {
  const specs = collectSpecs(async () =>
    fakeSession([
      account({ id: "1", email: "mail-only@example.com", capabilities: ["email"] }),
      account({ id: "2", email: "both@example.com", capabilities: ["email", "calendar"] }),
    ]),
  );

  it("picks the only calendar-capable account without being told", async () => {
    const listCalendars = specs.find((s) => s.name === "list_calendars")!;
    expect(body(await listCalendars.handler({} as never, {}))).toContain("both@example.com");
  });

  it("explains that a mail-only account needs reconnecting, and names one that works", async () => {
    const getEvent = specs.find((s) => s.name === "get_event")!;
    const result = await getEvent.handler(
      { account: "mail-only@example.com", calendar_id: "primary", event_id: "x" } as never,
      {},
    );
    expect(result.isError).toBe(true);
    expect(body(result)).toContain("connected for email only");
    expect(body(result)).toContain("both@example.com");
  });
});
