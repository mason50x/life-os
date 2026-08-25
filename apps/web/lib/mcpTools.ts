/**
 * The tools `/mcp` exposes, in the order a client tends to reach for them.
 * Shared by the dashboard page and the CLI's MCP screen so the two can't drift.
 * Keep in step with registerLifeOsTools in packages/mcp.
 */
export const MCP_TOOLS = [
  ["list_accounts", "Which inboxes are connected, and what each one is."],
  ["search_emails", "Search one account or every account at once."],
  ["get_thread", "A whole conversation, bodies included."],
  ["get_message", "One message with its full body."],
  ["send_email", "Send from any connected address."],
  ["create_draft", "Leave a draft in the mailbox to review."],
  ["archive_email", "Out of the inbox, still in the account."],
  ["trash_email", "To trash — recoverable, never a hard delete."],
  ["mark_read", "Read or unread."],
  ["list_labels", "Gmail labels, Outlook and iCloud folders."],
  ["modify_labels", "Relabel, or move between folders."],
] as const satisfies readonly (readonly [string, string])[];
