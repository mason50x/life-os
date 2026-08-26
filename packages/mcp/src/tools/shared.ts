import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, explain, type ToolResult } from "../format";
import type { LifeOsSession } from "../session";

export type SessionFor = (extra: unknown) => Promise<LifeOsSession>;

export interface Kit {
  server: McpServer;
  session: SessionFor;
}

/**
 * Every handler resolves the caller's session first and turns any throw into
 * an explained tool error rather than a transport-level failure — a model can
 * recover from the former and not from the latter.
 */
export function handled<A>(
  session: SessionFor,
  fn: (args: A, s: LifeOsSession) => Promise<ToolResult>,
): (args: A, extra: unknown) => Promise<ToolResult> {
  return async (args, extra) => {
    try {
      return await fn(args, await session(extra));
    } catch (e) {
      return fail(explain(e));
    }
  };
}

/** Hints clients use to decide what to run without asking the user first. */
export const READ_ONLY = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;

/** Changes the mailbox, but nothing a person couldn't undo. */
export const REVERSIBLE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Creates something new each time it runs. */
export const CREATES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Leaves the user's control — sent mail, or mail the user has to dig back out. */
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const account = z
  .string()
  .optional()
  .describe(
    "Which connected account to act on, by email address. Optional when only one account is connected; required otherwise. Use the `account` value that came back on the message you're acting on.",
  );

export const messageIds = z
  .array(z.string())
  .min(1)
  .describe(
    "One or more message ids from search_emails or get_thread, all belonging to the same account. Pass several at once rather than calling repeatedly.",
  );

export const bodyOptions = {
  full: z
    .boolean()
    .default(false)
    .describe("Return whole bodies instead of the first few thousand characters."),
  include_html: z
    .boolean()
    .default(false)
    .describe(
      "Also return the raw HTML body. Almost never needed — the plain-text version carries the same content at a fraction of the size.",
    ),
};

export const composeShape = {
  to: z.array(z.string()).min(1).describe("Recipient email addresses"),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string().describe("Plain-text message body"),
};
