import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectedAccount, EmailProvider } from "@lifeos/core";

/**
 * Everything the tools need to act on behalf of one authenticated LifeOS user.
 * The host (Next.js MCP route) supplies this per-request from the verified token.
 */
export interface LifeOsSession {
  userId: string;
  listAccounts(): Promise<ConnectedAccount[]>;
  /** Resolve a connected account's email address to a live provider client. */
  providerFor(accountEmail: string): Promise<EmailProvider>;
}

/** Auth info shape provided by the host's bearer-token verification (withMcpAuth). */
export interface McpAuthInfo {
  extra?: Record<string, unknown>;
}

export type ResolveSession = (authInfo?: McpAuthInfo) => Promise<LifeOsSession>;

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown): ToolResult {
  return {
    content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
    isError: true,
  };
}

const account = z
  .string()
  .describe("Email address of the connected account to act on (see list_accounts)");

const sendShape = {
  account,
  to: z.array(z.string()).describe("Recipient email addresses"),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string().describe("Plain-text message body"),
  thread_id: z.string().optional().describe("Reply within this thread"),
  in_reply_to: z
    .string()
    .optional()
    .describe("RFC 2822 Message-ID being replied to (Gmail threading)"),
};

export function registerLifeOsTools(server: McpServer, resolveSession: ResolveSession) {
  // Each handler receives (args, extra); extra.authInfo carries the verified
  // bearer token context injected by withMcpAuth in the host app.
  const session = (extra: unknown): Promise<LifeOsSession> =>
    resolveSession((extra as { authInfo?: McpAuthInfo } | undefined)?.authInfo);

  server.registerTool(
    "list_accounts",
    {
      title: "List connected accounts",
      description:
        "List all email accounts (Gmail, Outlook, iCloud) the user has connected to LifeOS. Call this first to learn which accounts are available.",
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const s = await session(extra);
        const accounts = await s.listAccounts();
        return ok(
          accounts.map((a) => ({
            email: a.email,
            provider: a.provider,
            status: a.status,
            displayName: a.displayName,
          })),
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "search_emails",
    {
      title: "Search emails",
      description:
        "Search emails across one or all connected accounts. Gmail accounts support Gmail query syntax (from:, subject:, is:unread, newer_than:7d...); Outlook uses free-text search. iCloud supports a Gmail-like subset (from:, to:, subject:, is:unread, newer_than:7d, before:/after:, in:sent|archive|trash|<folder>) and searches the inbox unless in: says otherwise.",
      inputSchema: {
        query: z.string().describe("Search query"),
        account: account
          .optional()
          .describe("Limit to one account; omit to search every connected account"),
        max_results: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, account: acct, max_results }, extra) => {
      try {
        const s = await session(extra);
        const accounts = acct
          ? [acct]
          : (await s.listAccounts()).filter((a) => a.status === "active").map((a) => a.email);
        const results = await Promise.allSettled(
          accounts.map(async (email) => (await s.providerFor(email)).search(query, max_results)),
        );
        // Dedupe identical hits: iCloud send-as accounts share one mailbox, so
        // the same message can come back once per connected address.
        const seen = new Set<string>();
        const messages = results
          .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
          .filter((m) => {
            const key = `${m.provider}:${m.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        const failures = results
          .map((r, i) => (r.status === "rejected" ? `${accounts[i]}: ${r.reason}` : null))
          .filter(Boolean);
        return ok({ messages, ...(failures.length ? { errors: failures } : {}) });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "get_thread",
    {
      title: "Get thread",
      description: "Fetch a full email thread (all messages, bodies included) by thread id.",
      inputSchema: { account, thread_id: z.string() },
    },
    async ({ account: acct, thread_id }, extra) => {
      try {
        const s = await session(extra);
        return ok(await (await s.providerFor(acct)).getThread(thread_id));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      title: "Get message",
      description: "Fetch a single email message with its full body.",
      inputSchema: { account, message_id: z.string() },
    },
    async ({ account: acct, message_id }, extra) => {
      try {
        const s = await session(extra);
        return ok(await (await s.providerFor(acct)).getMessage(message_id));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "send_email",
    {
      title: "Send email",
      description:
        "Send an email from one of the user's connected accounts. Confirm the draft with the user before sending when the content is consequential.",
      inputSchema: sendShape,
    },
    async ({ account: acct, to, cc, bcc, subject, body, thread_id, in_reply_to }, extra) => {
      try {
        const s = await session(extra);
        const res = await (await s.providerFor(acct)).send({
          to,
          cc,
          bcc,
          subject,
          body,
          threadId: thread_id,
          inReplyTo: in_reply_to,
        });
        return ok({ sent: true, id: res.id, from: acct });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create draft",
      description:
        "Create a draft in the user's mailbox without sending it. The user can review and send it from their email client.",
      inputSchema: sendShape,
    },
    async ({ account: acct, to, cc, bcc, subject, body, thread_id, in_reply_to }, extra) => {
      try {
        const s = await session(extra);
        const res = await (await s.providerFor(acct)).createDraft({
          to,
          cc,
          bcc,
          subject,
          body,
          threadId: thread_id,
          inReplyTo: in_reply_to,
        });
        return ok({ draftId: res.id, account: acct });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "archive_email",
    {
      title: "Archive email",
      description:
        "Archive a message (remove from inbox on Gmail, move to Archive on Outlook/iCloud).",
      inputSchema: { account, message_id: z.string() },
    },
    async ({ account: acct, message_id }, extra) => {
      try {
        const s = await session(extra);
        await (await s.providerFor(acct)).archive(message_id);
        return ok({ archived: true, message_id });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "trash_email",
    {
      title: "Trash email",
      description: "Move a message to trash (recoverable from the trash folder).",
      inputSchema: { account, message_id: z.string() },
    },
    async ({ account: acct, message_id }, extra) => {
      try {
        const s = await session(extra);
        await (await s.providerFor(acct)).trash(message_id);
        return ok({ trashed: true, message_id });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "mark_read",
    {
      title: "Mark read/unread",
      description: "Mark a message as read or unread.",
      inputSchema: { account, message_id: z.string(), read: z.boolean().default(true) },
    },
    async ({ account: acct, message_id, read }, extra) => {
      try {
        const s = await session(extra);
        await (await s.providerFor(acct)).markRead(message_id, read);
        return ok({ message_id, read });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "list_labels",
    {
      title: "List labels/folders",
      description: "List Gmail labels, or Outlook/iCloud mail folders, for an account.",
      inputSchema: { account },
    },
    async ({ account: acct }, extra) => {
      try {
        const s = await session(extra);
        return ok(await (await s.providerFor(acct)).listLabels());
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "modify_labels",
    {
      title: "Modify labels / move folder",
      description:
        "Gmail: add/remove label ids on a message. Outlook/iCloud: pass a folder id as the first `add` entry to move the message there.",
      inputSchema: {
        account,
        message_id: z.string(),
        add: z.array(z.string()).default([]),
        remove: z.array(z.string()).default([]),
      },
    },
    async ({ account: acct, message_id, add, remove }, extra) => {
      try {
        const s = await session(extra);
        await (await s.providerFor(acct)).modifyLabels(message_id, add, remove);
        return ok({ message_id, add, remove });
      } catch (e) {
        return err(e);
      }
    },
  );
}
