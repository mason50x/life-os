/**
 * The tools `/mcp` exposes, grouped the way a client reaches for them.
 * Shared by the dashboard page and the CLI's MCP screen so the two can't drift.
 * Keep in step with registerLifeOsTools in packages/mcp.
 *
 * A connection only advertises the groups the user has something connected
 * for; with no inbox linked, `list_accounts` is the whole surface.
 */
export const MCP_TOOL_GROUPS = [
  {
    title: "Getting oriented",
    tools: [
      ["list_accounts", "Which inboxes are connected, and how each one files mail."],
      ["list_labels", "Gmail labels, Outlook and iCloud folders."],
      ["create_label", "A new label or folder to file things under."],
    ],
  },
  {
    title: "Reading",
    tools: [
      ["search_emails", "One account or all of them, by sender, date, unread — or nothing at all, for the inbox."],
      ["get_thread", "A whole conversation, bodies included."],
      ["get_message", "One message with its full body."],
      ["list_attachments", "What came with a message."],
      ["get_attachment", "Read an attachment — images as images, text as text."],
    ],
  },
  {
    title: "Writing",
    tools: [
      ["send_email", "Start a new conversation from any connected address."],
      ["reply_email", "Reply in thread, with the recipients and headers worked out."],
      ["forward_email", "Pass a message on, quoted and attributed."],
    ],
  },
  {
    title: "Drafts",
    tools: [
      ["create_draft", "Leave a draft in the mailbox to review."],
      ["list_drafts", "What's sitting unsent."],
      ["update_draft", "Rewrite one after feedback."],
      ["send_draft", "Send it as it stands."],
      ["delete_draft", "Throw it away."],
    ],
  },
  {
    title: "Triage",
    tools: [
      ["archive_email", "Out of the inbox, still in the account."],
      ["trash_email", "To trash — recoverable, never a hard delete."],
      ["untrash_email", "Back out of the trash."],
      ["mark_read", "Read or unread."],
      ["star_email", "Gmail stars, Outlook flags, iCloud flags."],
      ["mark_spam", "Junk, or rescued from it."],
      ["move_email", "File it under a label or folder."],
      ["modify_labels", "Relabel a Gmail message without moving it."],
    ],
  },
] as const satisfies readonly {
  title: string;
  tools: readonly (readonly [string, string])[];
}[];

/** Flat list, for surfaces that just want every tool in order. */
export const MCP_TOOLS = MCP_TOOL_GROUPS.flatMap((g) =>
  g.tools.map(([name, what]) => [name, what] as const),
);

/**
 * The one tool a connection advertises unconditionally. Everything else is
 * gated on the user having an inbox for it to act on, so a connection made
 * before any inbox is linked shows this and nothing else — which is what tells
 * the model where to send the user next.
 */
export const ALWAYS_ON_TOOLS = ["list_accounts"] as const;

/** What a given user's connection actually advertises right now. */
export function toolsFor(hasActiveAccount: boolean) {
  return MCP_TOOLS.filter(
    ([name]) => hasActiveAccount || (ALWAYS_ON_TOOLS as readonly string[]).includes(name),
  );
}
