import type { Capability } from "@lifeos/core";

/**
 * The tools `/mcp` exposes, grouped the way a client reaches for them.
 * Shared by the dashboard page and the CLI's MCP screen so the two can't drift.
 * Keep in step with the tool specs in packages/mcp.
 *
 * A connection only advertises the groups the user has something connected
 * for; with nothing linked, `list_accounts` is the whole surface. Groups
 * marked `core` are advertised directly — the rest are reachable through
 * find_tools and run_tool, which costs the model a lookup and costs every
 * conversation forty fewer schemas.
 */
export const MCP_TOOL_GROUPS = [
  {
    title: "Getting oriented",
    surface: "core",
    tier: "core",
    tools: [["list_accounts", "Which accounts are connected, what each one is good for, and how it files mail."]],
  },
  {
    title: "Finding tools",
    surface: "core",
    tier: "core",
    tools: [
      ["find_tools", "Search everything below and get its schema, without paying for it up front."],
      ["run_tool", "Call whatever find_tools turned up."],
    ],
  },
  {
    title: "Reading mail",
    surface: "email",
    tier: "core",
    tools: [
      ["search_emails", "One account or all of them, by sender, date, unread — or nothing at all, for the inbox."],
      ["get_thread", "A whole conversation, bodies included."],
      ["get_message", "One message with its full body."],
    ],
  },
  {
    title: "Writing mail",
    surface: "email",
    tier: "core",
    tools: [
      ["send_email", "Start a new conversation from any connected address."],
      ["reply_email", "Reply in thread, with the recipients and headers worked out."],
    ],
  },
  {
    title: "Triage",
    surface: "email",
    tier: "core",
    tools: [
      ["archive_email", "Out of the inbox, still in the account."],
      ["trash_email", "To trash — recoverable, never a hard delete."],
    ],
  },
  {
    title: "Calendar",
    surface: "calendar",
    tier: "core",
    tools: [
      ["list_calendars", "Every calendar on every connected account."],
      ["list_events", "What's on, between two dates, repeats expanded."],
      ["get_event", "One event in full — guests, RSVPs, recurrence, meeting link."],
      ["create_event", "Put something in the diary, and invite people to it."],
      ["update_event", "Move it, rename it, re-guest it — one occurrence or the series."],
    ],
  },
  {
    title: "More mail",
    surface: "email",
    tier: "extended",
    tools: [
      ["list_labels", "Gmail labels, Outlook and iCloud folders."],
      ["create_label", "A new label or folder to file things under."],
      ["forward_email", "Pass a message on, quoted and attributed."],
      ["create_draft", "Leave a draft in the mailbox to review."],
      ["list_drafts", "What's sitting unsent."],
      ["update_draft", "Rewrite one after feedback."],
      ["send_draft", "Send it as it stands."],
      ["delete_draft", "Throw it away."],
      ["list_attachments", "What came with a message."],
      ["get_attachment", "Read an attachment — images as images, text as text."],
      ["untrash_email", "Back out of the trash."],
      ["mark_read", "Read or unread."],
      ["star_email", "Gmail stars, Outlook flags, iCloud flags."],
      ["mark_spam", "Junk, or rescued from it."],
      ["move_email", "File it under a label or folder."],
      ["modify_labels", "Relabel a Gmail message without moving it."],
    ],
  },
  {
    title: "More calendar",
    surface: "calendar",
    tier: "extended",
    tools: [
      ["search_events", "Find an appointment by name, place or who's coming."],
      ["delete_event", "Cancel one occurrence, or the whole series."],
      ["respond_to_event", "Accept, decline, or maybe."],
      ["move_event", "Shift an event to another calendar."],
      ["find_free_time", "Real gaps, across every calendar at once."],
      ["create_calendar", "A separate calendar for a project or a person."],
      ["update_calendar", "Rename it, recolour it."],
      ["delete_calendar", "Remove a calendar and everything on it."],
    ],
  },
] as const satisfies readonly {
  title: string;
  surface: Capability | "core";
  tier: "core" | "extended";
  tools: readonly (readonly [string, string])[];
}[];

/**
 * The groups a given user's connection really advertises right now. "Getting
 * oriented" is the one that is never gated: a connection made before anything
 * is linked shows `list_accounts` and nothing else, which is what tells the
 * model where to send the user next.
 */
export function groupsFor(capabilities: Capability[]) {
  const connected = new Set(capabilities);
  return MCP_TOOL_GROUPS.filter(
    (g) =>
      // find_tools only appears once there is a long tail to search.
      (g.surface === "core" && (connected.size > 0 || g.title === "Getting oriented")) ||
      connected.has(g.surface as Capability),
  );
}

/** Every capability across a user's accounts — what the connection can reach. */
export function capabilitiesOf(
  accounts: { status: string; capabilities: Capability[] }[],
): Capability[] {
  const connected = new Set<Capability>();
  for (const account of accounts) {
    if (account.status === "active") account.capabilities.forEach((c) => connected.add(c));
  }
  return [...connected];
}
