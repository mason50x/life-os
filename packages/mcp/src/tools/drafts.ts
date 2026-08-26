import { z } from "zod";
import { ok } from "../format";
import { resolveAccount } from "../session";
import {
  composeBody,
  quoteForReply,
  replyRecipients,
  replySubject,
} from "../compose";
import {
  CREATES,
  DESTRUCTIVE,
  Kit,
  READ_ONLY,
  REVERSIBLE,
  account,
  composeShape,
  handled,
} from "./shared";

export function registerDraftTools({ server, session }: Kit) {
  server.registerTool(
    "create_draft",
    {
      title: "Save a draft",
      description:
        "Writes a message into the user's Drafts without sending it, so they can look it over in their own mail client. The safe choice when the user hasn't explicitly asked you to send. Pass reply_to_message_id to draft a reply inside an existing thread, and the recipients, subject and quoted original are worked out for you.",
      inputSchema: {
        account,
        ...composeShape,
        to: composeShape.to.optional().describe(
          "Recipient email addresses. Optional when replying — the original's sender is used.",
        ),
        subject: composeShape.subject
          .optional()
          .describe("Optional when replying — Re: the original subject is used."),
        reply_to_message_id: z
          .string()
          .optional()
          .describe("Draft this as a reply to that message, in its thread."),
        reply_all: z
          .boolean()
          .default(false)
          .describe("When replying, cc everyone else on the original too."),
      },
      annotations: CREATES,
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          to?: string[];
          cc?: string[];
          bcc?: string[];
          subject?: string;
          body: string;
          reply_to_message_id?: string;
          reply_all: boolean;
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account);
        const provider = await s.providerFor(email);

        if (args.reply_to_message_id) {
          const original = await provider.getMessage(args.reply_to_message_id);
          const derived = replyRecipients(original, email, args.reply_all);
          const to = args.to ?? derived.to;
          const cc = args.cc ?? (derived.cc.length ? derived.cc : undefined);
          const res = await provider.createDraft({
            to,
            cc,
            bcc: args.bcc,
            subject: args.subject ?? replySubject(original.subject),
            body: composeBody(args.body, quoteForReply(original)),
            threadId: original.threadId,
            inReplyTo: original.messageId,
          });
          return ok({ draft_id: res.id, account: email, to, thread_id: original.threadId });
        }

        if (!args.to?.length) {
          return ok({
            error:
              "A new draft needs `to`. To draft a reply instead, pass reply_to_message_id and the recipients are derived from it.",
          });
        }
        const res = await provider.createDraft({
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject ?? "(no subject)",
          body: args.body,
        });
        return ok({ draft_id: res.id, account: email, to: args.to });
      },
    ),
  );

  server.registerTool(
    "list_drafts",
    {
      title: "List drafts",
      description:
        "Lists unsent drafts on one account, newest first, with the draft ids that update_draft, send_draft and delete_draft need. Draft ids are not message ids and only work with the draft tools.",
      inputSchema: {
        account,
        max_results: z.number().int().min(1).max(50).default(20),
      },
      annotations: READ_ONLY,
    },
    handled(
      session,
      async ({ account: acct, max_results }: { account?: string; max_results: number }, s) => {
        const email = await resolveAccount(s, acct);
        const drafts = await (await s.providerFor(email)).listDrafts(max_results);
        return ok({ account: email, drafts });
      },
    ),
  );

  server.registerTool(
    "update_draft",
    {
      title: "Rewrite a draft",
      description:
        "Replaces a draft's recipients, subject and body wholesale — there is no partial edit, so send every field you want the draft to end up with. Use it to revise a draft the user has given feedback on. On iCloud the draft is re-saved, so the returned id may differ from the one you passed; use the new one from then on.",
      inputSchema: {
        account,
        draft_id: z.string().describe("A draft id from list_drafts or create_draft."),
        ...composeShape,
      },
      annotations: REVERSIBLE,
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          draft_id: string;
          to: string[];
          cc?: string[];
          bcc?: string[];
          subject: string;
          body: string;
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account);
        const res = await (await s.providerFor(email)).updateDraft(args.draft_id, {
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject,
          body: args.body,
        });
        return ok({
          draft_id: res.id,
          account: email,
          ...(res.id !== args.draft_id ? { replaced: args.draft_id } : {}),
        });
      },
    ),
  );

  server.registerTool(
    "send_draft",
    {
      title: "Send a draft",
      description:
        "Sends a draft exactly as it stands and removes it from Drafts. Read it back with list_drafts and show the user before sending — this cannot be undone.",
      inputSchema: {
        account,
        draft_id: z.string().describe("A draft id from list_drafts or create_draft."),
      },
      annotations: DESTRUCTIVE,
    },
    handled(
      session,
      async ({ account: acct, draft_id }: { account?: string; draft_id: string }, s) => {
        const email = await resolveAccount(s, acct);
        const res = await (await s.providerFor(email)).sendDraft(draft_id);
        return ok({
          sent: true,
          from: email,
          ...(res.id && res.id !== "sent" ? { id: res.id } : {}),
        });
      },
    ),
  );

  server.registerTool(
    "delete_draft",
    {
      title: "Delete a draft",
      description:
        "Throws away an unsent draft. Drafts don't go to the trash, so this one really is gone — confirm with the user unless they asked for it.",
      inputSchema: { account, draft_id: z.string() },
      annotations: DESTRUCTIVE,
    },
    handled(
      session,
      async ({ account: acct, draft_id }: { account?: string; draft_id: string }, s) => {
        const email = await resolveAccount(s, acct);
        await (await s.providerFor(email)).deleteDraft(draft_id);
        return ok({ deleted: true, draft_id, account: email });
      },
    ),
  );
}
