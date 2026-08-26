import type { MessageSummary, Provider } from "@lifeos/core";

/**
 * What the model actually wants to express, independent of provider. Each
 * provider speaks a different search dialect — Gmail's operators, Graph's KQL,
 * IMAP's SEARCH — and asking a model to pick the right one per account across
 * a fan-out is where searches quietly come back wrong.
 */
export interface SearchFilters {
  /** Free text, or raw provider syntax for callers who know the dialect. */
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  unread?: boolean;
  starred?: boolean;
  has_attachment?: boolean;
  /** YYYY-MM-DD, inclusive. */
  after?: string;
  before?: string;
  /** inbox | sent | archive | trash | spam | drafts, or a label/folder name. */
  in?: string;
}

const FOLDER_ALIASES = new Set(["inbox", "sent", "archive", "trash", "spam", "junk", "drafts"]);

function gmailDate(iso: string): string {
  return iso.replace(/-/g, "/");
}

/** Quote a value if it contains whitespace, so `from:Jane Doe` doesn't split. */
function q(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export interface CompiledQuery {
  query: string;
  /** Filters this provider's search can't express; applied client-side or dropped. */
  unsupported: string[];
}

export function compileQuery(provider: Provider, f: SearchFilters): CompiledQuery {
  switch (provider) {
    case "gmail":
      return compileGmail(f);
    case "icloud":
      return compileIcloud(f);
    case "outlook":
      return compileOutlook(f);
  }
}

function compileGmail(f: SearchFilters): CompiledQuery {
  const parts: string[] = [];
  if (f.from) parts.push(`from:${q(f.from)}`);
  if (f.to) parts.push(`to:${q(f.to)}`);
  if (f.subject) parts.push(`subject:${q(f.subject)}`);
  if (f.unread !== undefined) parts.push(f.unread ? "is:unread" : "is:read");
  if (f.starred !== undefined) parts.push(f.starred ? "is:starred" : "-is:starred");
  if (f.has_attachment !== undefined) {
    parts.push(f.has_attachment ? "has:attachment" : "-has:attachment");
  }
  if (f.after) parts.push(`after:${gmailDate(f.after)}`);
  if (f.before) parts.push(`before:${gmailDate(f.before)}`);
  if (f.in) parts.push(FOLDER_ALIASES.has(f.in.toLowerCase()) ? `in:${f.in}` : `label:${q(f.in)}`);
  if (f.query) parts.push(f.query);
  // Gmail's own default is "everywhere including spam and trash"; the inbox is
  // what a bare "what's new" question means.
  return { query: parts.join(" ") || "in:inbox", unsupported: [] };
}

/**
 * iCloud has no server-side search language — the provider parses a Gmail-like
 * subset into an IMAP SEARCH. Emit only what that parser understands.
 */
function compileIcloud(f: SearchFilters): CompiledQuery {
  const parts: string[] = [];
  const unsupported: string[] = [];
  if (f.from) parts.push(`from:${q(f.from)}`);
  if (f.to) parts.push(`to:${q(f.to)}`);
  if (f.subject) parts.push(`subject:${q(f.subject)}`);
  if (f.unread !== undefined) parts.push(f.unread ? "is:unread" : "is:read");
  if (f.after) parts.push(`after:${gmailDate(f.after)}`);
  if (f.before) parts.push(`before:${gmailDate(f.before)}`);
  if (f.in) parts.push(`in:${f.in}`);
  if (f.query) parts.push(f.query);
  if (f.starred !== undefined) unsupported.push("starred (filtered after the fact)");
  if (f.has_attachment !== undefined) unsupported.push("has_attachment (filtered after the fact)");
  return { query: parts.join(" ") || "in:inbox", unsupported };
}

/**
 * Graph's $search takes KQL, which covers sender, subject, body text, dates
 * and attachments — but not read state, flags, or folder scoping, and it can't
 * be combined with $filter. Those three come back as post-filters or caveats.
 */
function compileOutlook(f: SearchFilters): CompiledQuery {
  const parts: string[] = [];
  const unsupported: string[] = [];
  if (f.from) parts.push(`from:${q(f.from)}`);
  if (f.to) parts.push(`to:${q(f.to)}`);
  if (f.subject) parts.push(`subject:${q(f.subject)}`);
  if (f.has_attachment) parts.push("hasAttachment:true");
  if (f.after) parts.push(`received>=${f.after}`);
  if (f.before) parts.push(`received<=${f.before}`);
  if (f.query) parts.push(f.query);
  if (f.unread !== undefined) unsupported.push("unread (filtered after the fact)");
  if (f.starred !== undefined) unsupported.push("starred (filtered after the fact)");
  if (f.has_attachment === false) unsupported.push("has_attachment: false (filtered after the fact)");
  if (f.in) unsupported.push(`in: "${f.in}" — Outlook search covers the whole mailbox`);
  return { query: parts.join(" "), unsupported };
}

/**
 * Filters no provider could express server-side, applied uniformly so the same
 * request means the same thing on every account. A no-op where the provider
 * already handled it.
 */
export function postFilter(messages: MessageSummary[], f: SearchFilters): MessageSummary[] {
  return messages.filter((m) => {
    if (f.unread !== undefined && m.isUnread !== undefined && m.isUnread !== f.unread) return false;
    if (f.starred !== undefined && m.isStarred !== undefined && m.isStarred !== f.starred) {
      return false;
    }
    if (
      f.has_attachment !== undefined &&
      m.hasAttachments !== undefined &&
      m.hasAttachments !== f.has_attachment
    ) {
      return false;
    }
    return true;
  });
}

export function hasAnyFilter(f: SearchFilters): boolean {
  return Object.values(f).some((v) => v !== undefined && v !== "");
}
