import { z } from "zod";
import type { MessageSummary } from "@lifeos/core";
import {
  UNTRUSTED_CONTENT_WARNING,
  explain,
  ok,
  shapeMessage,
  shapeSummary,
  shapeThread,
} from "../format";
import { activeAccounts, resolveAccount } from "../session";
import { compileQuery, postFilter, type SearchFilters } from "../query";
import { Kit, READ_ONLY, account, bodyOptions, handled } from "./shared";

const filterShape = {
  query: z
    .string()
    .optional()
    .describe(
      "Free text to match anywhere in the message. Provider search syntax (Gmail operators, Graph KQL) also works if you know it, but the named filters below are safer — they are translated per provider.",
    ),
  from: z.string().optional().describe("Sender name or address"),
  to: z.string().optional().describe("Recipient name or address"),
  subject: z.string().optional().describe("Words in the subject line"),
  unread: z.boolean().optional().describe("true for unread only, false for read only"),
  starred: z
    .boolean()
    .optional()
    .describe("Gmail stars, Outlook flags and iCloud flagged mail — one and the same thing"),
  has_attachment: z.boolean().optional(),
  after: z.string().optional().describe("On or after this date, as YYYY-MM-DD"),
  before: z.string().optional().describe("On or before this date, as YYYY-MM-DD"),
  in: z
    .string()
    .optional()
    .describe(
      "Where to look: inbox, sent, archive, trash, spam, drafts, or a label/folder name. Defaults to the inbox. Outlook searches the whole mailbox regardless.",
    ),
};

export function registerReadTools({ server, session }: Kit) {
  server.registerTool(
    "search_emails",
    {
      title: "Search emails",
      description:
        "Finds messages across one account or every connected account at once, and returns summaries — sender, subject, date, snippet, ids. This is also how you list an inbox: call it with no filters at all for the most recent inbox messages. Use the named filters rather than writing provider query syntax; LifeOS translates them into Gmail operators, Graph KQL or IMAP search per account, so one call means the same thing everywhere. Follow up with get_message or get_thread when you need the actual body.",
      inputSchema: {
        ...filterShape,
        account: account.describe(
          "Limit the search to one account. Omit to search every connected account at once.",
        ),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Per account, not in total."),
      },
      annotations: READ_ONLY,
    },
    handled(
      session,
      async (
        args: SearchFilters & { account?: string; max_results: number },
        s,
      ) => {
        const { account: acct, max_results, ...filters } = args;
        const accounts = acct ? [await resolveAccount(s, acct)] : await activeAccounts(s);
        if (accounts.length === 0) {
          return ok({
            messages: [],
            next_step:
              "No inboxes are connected. The user needs to connect one in the LifeOS dashboard.",
          });
        }

        const caveats = new Set<string>();
        const results = await Promise.allSettled(
          accounts.map(async (email) => {
            const provider = await s.providerFor(email);
            const compiled = compileQuery(provider.provider, filters);
            compiled.unsupported.forEach((u) => caveats.add(`${provider.provider}: ${u}`));
            const hits = await provider.search(compiled.query, max_results);
            return postFilter(hits, filters);
          }),
        );

        // Dedupe identical hits: iCloud send-as accounts share one mailbox, so
        // the same message can come back once per connected address.
        const seen = new Set<string>();
        const messages = results
          .flatMap((r) => (r.status === "fulfilled" ? r.value : ([] as MessageSummary[])))
          .filter((m) => {
            const key = `${m.provider}:${m.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(shapeSummary);
        const failures = results
          .map((r, i) => (r.status === "rejected" ? `${accounts[i]}: ${explain(r.reason)}` : null))
          .filter(Boolean);

        return ok({
          messages,
          searched: accounts,
          ...(caveats.size ? { filters_not_supported: [...caveats] } : {}),
          ...(failures.length ? { errors: failures } : {}),
        });
      },
    ),
  );

  server.registerTool(
    "get_thread",
    {
      title: "Get a whole conversation",
      description:
        "Fetches every message in one conversation, oldest first, with bodies. Use this before replying so the reply answers what was actually said. Bodies are trimmed unless you ask for full ones.",
      inputSchema: {
        account,
        thread_id: z
          .string()
          .describe("A thread id from search_emails (the `threadId` field on a result)."),
        ...bodyOptions,
      },
      annotations: READ_ONLY,
    },
    handled(
      session,
      async (
        {
          account: acct,
          thread_id,
          full,
          include_html,
        }: { account?: string; thread_id: string; full: boolean; include_html: boolean },
        s,
      ) => {
        const email = await resolveAccount(s, acct);
        const thread = await (await s.providerFor(email)).getThread(thread_id);
        return ok({
          warning: UNTRUSTED_CONTENT_WARNING,
          thread: shapeThread(thread, { full, includeHtml: include_html }),
        });
      },
    ),
  );

  server.registerTool(
    "get_message",
    {
      title: "Get one message",
      description:
        "Fetches a single message with its body and its attachment list. Reach for get_thread instead when the message is part of a back-and-forth and the earlier messages matter.",
      inputSchema: {
        account,
        message_id: z.string().describe("A message id from search_emails or get_thread."),
        ...bodyOptions,
      },
      annotations: READ_ONLY,
    },
    handled(
      session,
      async (
        {
          account: acct,
          message_id,
          full,
          include_html,
        }: { account?: string; message_id: string; full: boolean; include_html: boolean },
        s,
      ) => {
        const email = await resolveAccount(s, acct);
        const message = await (await s.providerFor(email)).getMessage(message_id);
        return ok({
          warning: UNTRUSTED_CONTENT_WARNING,
          message: shapeMessage(message, { full, includeHtml: include_html }),
        });
      },
    ),
  );
}
