import { z } from "zod";
import { ok } from "../format";
import { resolveAccount } from "../session";
import {
  composeBody,
  forwardSubject,
  quoteForForward,
  quoteForReply,
  replyRecipients,
  replySubject,
} from "../compose";
import { DESTRUCTIVE, Kit, account, composeShape, handled } from "./shared";

function sent(id: string, from: string, extra: Record<string, unknown> = {}) {
  // Outlook re-creates the message in Sent Items, so there's no id worth
  // reporting; better to say nothing than to hand back one that won't resolve.
  return ok({ sent: true, from, ...(id && id !== "sent" ? { id } : {}), ...extra });
}

export function registerSendTools({ server, session }: Kit) {
  server.registerTool(
    "send_email",
    {
      title: "Send a new email",
      description:
        "Starts a new conversation from one of the user's connected addresses. To answer an existing message use reply_email instead — it handles recipients, subject and threading, which this tool does not. Sending cannot be undone: show the user the recipients, subject and body and get their agreement first, unless they've already said to go ahead.",
      inputSchema: { account, ...composeShape },
      annotations: DESTRUCTIVE,
    },
    handled(
      session,
      async (
        args: { account?: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string },
        s,
      ) => {
        const email = await resolveAccount(s, args.account);
        const res = await (await s.providerFor(email)).send({
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject: args.subject,
          body: args.body,
        });
        return sent(res.id, email);
      },
    ),
  );

  server.registerTool(
    "reply_email",
    {
      title: "Reply to a message",
      description:
        "Replies to a message, in its thread. Give it the message you're answering and what you want to say; it works out who to send to, the Re: subject, the threading headers and the quoted original. This is the right tool for every reply — send_email leaves replies detached from their conversation. Read the thread first with get_thread so the reply answers what was said. Sending cannot be undone: check the draft with the user first unless they've already said to go ahead.",
      inputSchema: {
        account,
        message_id: z
          .string()
          .describe("The message being replied to, from search_emails or get_thread."),
        body: z.string().describe("What you're writing back, in plain text."),
        reply_all: z
          .boolean()
          .default(false)
          .describe("Include everyone else on the original as cc, not just the sender."),
        quote: z
          .boolean()
          .default(true)
          .describe("Append the quoted original beneath the reply, as a mail client would."),
        to: z
          .array(z.string())
          .optional()
          .describe("Override the worked-out recipients. Rarely needed."),
        cc: z.array(z.string()).optional().describe("Override the worked-out cc list."),
        bcc: z.array(z.string()).optional(),
      },
      annotations: DESTRUCTIVE,
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          message_id: string;
          body: string;
          reply_all: boolean;
          quote: boolean;
          to?: string[];
          cc?: string[];
          bcc?: string[];
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account);
        const provider = await s.providerFor(email);
        const original = await provider.getMessage(args.message_id);
        const derived = replyRecipients(original, email, args.reply_all);
        const to = args.to ?? derived.to;
        if (to.length === 0) {
          return ok({
            sent: false,
            error:
              "Couldn't work out who to reply to — the original has no sender or recipients. Pass `to` explicitly.",
          });
        }
        const cc = args.cc ?? derived.cc;
        const subject = replySubject(original.subject);
        const res = await provider.send({
          to,
          cc: cc.length ? cc : undefined,
          bcc: args.bcc,
          subject,
          body: composeBody(args.body, args.quote ? quoteForReply(original) : undefined),
          threadId: original.threadId,
          inReplyTo: original.messageId,
        });
        // Report who it actually went to: the model asked for a reply, not for
        // a particular recipient list, and the user should see what was chosen.
        return sent(res.id, email, {
          to,
          ...(cc.length ? { cc } : {}),
          subject,
          thread_id: original.threadId,
        });
      },
    ),
  );

  server.registerTool(
    "forward_email",
    {
      title: "Forward a message",
      description:
        "Passes a message on to someone else, with the original quoted underneath and its headers intact. Forwarding shares whatever the original contains, including things the user may not have read — say what you're forwarding and to whom, and get their agreement first.",
      inputSchema: {
        account,
        message_id: z.string().describe("The message to forward."),
        to: z.array(z.string()).min(1).describe("Who to forward it to."),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        note: z
          .string()
          .default("")
          .describe("Optional line of your own, placed above the forwarded message."),
      },
      annotations: DESTRUCTIVE,
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          message_id: string;
          to: string[];
          cc?: string[];
          bcc?: string[];
          note: string;
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account);
        const provider = await s.providerFor(email);
        const original = await provider.getMessage(args.message_id);
        const subject = forwardSubject(original.subject);
        const res = await provider.send({
          to: args.to,
          cc: args.cc,
          bcc: args.bcc,
          subject,
          body: composeBody(args.note, quoteForForward(original)),
        });
        return sent(res.id, email, {
          to: args.to,
          subject,
          ...(original.attachments?.length
            ? {
                note: `The original's ${original.attachments.length} attachment(s) were not carried over — LifeOS forwards the message text only.`,
              }
            : {}),
        });
      },
    ),
  );
}
