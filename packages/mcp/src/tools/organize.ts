import { z } from "zod";
import { batchResult, eachMessage, ok } from "../format";
import { resolveAccount } from "../session";
import { DESTRUCTIVE, Kit, REVERSIBLE, account, handled, messageIds } from "./shared";

interface BatchArgs {
  account?: string;
  message_ids: string[];
}

export function registerOrganizeTools({ register, session }: Kit) {
  register(
    "archive_email",
    {
      title: "Archive messages",
      description:
        "Takes messages out of the inbox while leaving them in the account — Gmail drops the INBOX label, Outlook and iCloud move to Archive. The everyday way to clear an inbox; nothing is deleted and search still finds them.",
      inputSchema: { account, message_ids: messageIds },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "core",
    },
    handled(session, async ({ account: acct, message_ids }: BatchArgs, s) => {
      const email = await resolveAccount(s, acct);
      const p = await s.providerFor(email);
      return batchResult("archived", email, await eachMessage(message_ids, (id) => p.archive(id)));
    }),
  );

  register(
    "trash_email",
    {
      title: "Move messages to trash",
      description:
        "Moves messages to the trash, where the user can still get them back with untrash_email until the provider empties it. Never a permanent delete. Prefer archive_email when the user just wants them out of the inbox; confirm before trashing anything they haven't explicitly pointed at.",
      inputSchema: { account, message_ids: messageIds },
      annotations: DESTRUCTIVE,
      surface: "email",
      tier: "core",
    },
    handled(session, async ({ account: acct, message_ids }: BatchArgs, s) => {
      const email = await resolveAccount(s, acct);
      const p = await s.providerFor(email);
      return batchResult("trashed", email, await eachMessage(message_ids, (id) => p.trash(id)));
    }),
  );

  register(
    "untrash_email",
    {
      title: "Restore messages from trash",
      description:
        "Pulls messages back out of the trash. Gmail returns them to the labels they had; Outlook and iCloud keep no record of where a message came from, so it lands in the inbox. Find trashed messages with search_emails and in: \"trash\".",
      inputSchema: { account, message_ids: messageIds },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "extended",
      keywords: ["untrash", "restore", "recover", "undelete"],
    },
    handled(session, async ({ account: acct, message_ids }: BatchArgs, s) => {
      const email = await resolveAccount(s, acct);
      const p = await s.providerFor(email);
      return batchResult("restored", email, await eachMessage(message_ids, (id) => p.untrash(id)));
    }),
  );

  register(
    "mark_read",
    {
      title: "Mark messages read or unread",
      description:
        "Sets the read state on messages. Pass read: false to mark something unread again, e.g. to leave it for the user to deal with.",
      inputSchema: {
        account,
        message_ids: messageIds,
        read: z.boolean().default(true).describe("true marks read, false marks unread."),
      },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "extended",
      keywords: ["read", "unread", "seen", "triage"],
    },
    handled(
      session,
      async ({ account: acct, message_ids, read }: BatchArgs & { read: boolean }, s) => {
        const email = await resolveAccount(s, acct);
        const p = await s.providerFor(email);
        return batchResult(
          read ? "marked read" : "marked unread",
          email,
          await eachMessage(message_ids, (id) => p.markRead(id, read)),
        );
      },
    ),
  );

  register(
    "star_email",
    {
      title: "Star or unstar messages",
      description:
        "Flags messages for attention — a Gmail star, an Outlook flag, an iCloud flagged message. Useful for handing a shortlist back to the user without moving anything. Find them again with search_emails and starred: true.",
      inputSchema: {
        account,
        message_ids: messageIds,
        starred: z.boolean().default(true).describe("true stars, false removes the star."),
      },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "extended",
      keywords: ["star", "flag", "important", "shortlist"],
    },
    handled(
      session,
      async ({ account: acct, message_ids, starred }: BatchArgs & { starred: boolean }, s) => {
        const email = await resolveAccount(s, acct);
        const p = await s.providerFor(email);
        return batchResult(
          starred ? "starred" : "unstarred",
          email,
          await eachMessage(message_ids, (id) => p.setStarred(id, starred)),
        );
      },
    ),
  );

  register(
    "mark_spam",
    {
      title: "Mark messages as spam, or not spam",
      description:
        "Files messages as junk, or rescues them back to the inbox with spam: false. This teaches the provider's filter, so it affects mail the user hasn't received yet — only do it when the user has said something is spam.",
      inputSchema: {
        account,
        message_ids: messageIds,
        spam: z
          .boolean()
          .default(true)
          .describe("true files as spam, false restores to the inbox."),
      },
      annotations: DESTRUCTIVE,
      surface: "email",
      tier: "extended",
      keywords: ["spam", "junk", "phishing", "not spam"],
    },
    handled(
      session,
      async ({ account: acct, message_ids, spam }: BatchArgs & { spam: boolean }, s) => {
        const email = await resolveAccount(s, acct);
        const p = await s.providerFor(email);
        return batchResult(
          spam ? "marked spam" : "marked not spam",
          email,
          await eachMessage(message_ids, (id) => p.setSpam(id, spam)),
        );
      },
    ),
  );

  register(
    "move_email",
    {
      title: "File messages under a label or folder",
      description:
        "Files messages away and takes them out of the inbox. Works the same on every provider: Gmail applies the label and drops INBOX, Outlook and iCloud move to the folder. This is the tool for \"put these in X\". Get `destination` from list_labels — it is an id, not a display name.",
      inputSchema: {
        account,
        message_ids: messageIds,
        destination: z
          .string()
          .describe("Label or folder id from list_labels. Create one first with create_label if it doesn't exist."),
      },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "extended",
      keywords: ["move", "file", "folder", "label", "organise"],
    },
    handled(
      session,
      async ({ account: acct, message_ids, destination }: BatchArgs & { destination: string }, s) => {
        const email = await resolveAccount(s, acct);
        const p = await s.providerFor(email);
        return batchResult(
          `moved to ${destination}`,
          email,
          await eachMessage(message_ids, (id) => p.move(id, destination)),
        );
      },
    ),
  );

  register(
    "modify_labels",
    {
      title: "Add or remove Gmail labels",
      description:
        "Adds and removes labels on Gmail messages without moving them — a Gmail message can carry several labels at once, so this is how you tag one while leaving it in the inbox. Only meaningful on Gmail accounts (list_accounts reports organizes_by: labels). On Outlook and iCloud, which give a message exactly one folder, use move_email instead.",
      inputSchema: {
        account,
        message_ids: messageIds,
        add: z.array(z.string()).default([]).describe("Label ids to add, from list_labels."),
        remove: z.array(z.string()).default([]).describe("Label ids to remove."),
      },
      annotations: REVERSIBLE,
      surface: "email",
      tier: "extended",
      keywords: ["label", "tag", "relabel", "gmail"],
    },
    handled(
      session,
      async (
        { account: acct, message_ids, add, remove }: BatchArgs & { add: string[]; remove: string[] },
        s,
      ) => {
        const email = await resolveAccount(s, acct);
        const p = await s.providerFor(email);
        if (p.provider !== "gmail") {
          return ok({
            skipped: true,
            account: email,
            reason: `${email} is an ${p.provider} account, which files a message in one folder rather than tagging it with labels. Use move_email with a folder id from list_labels.`,
          });
        }
        return batchResult(
          "relabelled",
          email,
          await eachMessage(message_ids, (id) => p.modifyLabels(id, add, remove)),
        );
      },
    ),
  );
}
