export type Provider = "gmail" | "outlook" | "icloud";

/** Providers connected via OAuth (iCloud uses an app-specific password instead). */
export type OAuthProvider = Exclude<Provider, "icloud">;

/**
 * What one connected account can actually be used for. A Google grant carries
 * both when the user consented to calendar alongside mail; an account linked
 * before calendar existed carries only "email" until it is reconnected.
 */
export type Capability = "email" | "calendar";

export interface ConnectedAccount {
  id: string;
  userId: string;
  provider: Provider;
  email: string;
  displayName?: string;
  /** What the user renamed this account to. Absent means the default name. */
  nickname?: string;
  status: "active" | "needs_reauth" | "disconnected";
  /** Never empty: an account with nothing usable would not be stored. */
  capabilities: Capability[];
  /**
   * The account this one's calendar actually lives on, when it isn't its own.
   * iCloud custom-domain and alias addresses are separate mail accounts over a
   * single Apple sign-in, and that sign-in has exactly one set of calendars —
   * so one of them stands for it and the rest point at that one. Absent means
   * the account speaks for its own calendar, which is every other case.
   */
  calendarOf?: string;
  connectedAt: number;
}

/** Longest nickname worth storing — a name, not a sentence. */
export const MAX_ACCOUNT_NICKNAME = 40;

/**
 * The name an account goes by when nobody has renamed it: the address without
 * its domain, which is what people call these accounts out loud anyway.
 */
export function defaultAccountName(email: string): string {
  return email.split("@")[0] || email;
}

/** What one account is called — the user's name for it, or the default. */
export function accountName(account: { email: string; nickname?: string }): string {
  return account.nickname?.trim() || defaultAccountName(account.email);
}

/**
 * Names for a whole list, keyed by email. Defaults collide the moment someone
 * connects mason@gmail.com and mason@icloud.com, and two rows reading "mason"
 * help nobody — so a colliding default falls back to the full address, while a
 * nickname the user typed is left exactly as they typed it.
 */
export function accountNames(accounts: { email: string; nickname?: string }[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    if (a.nickname?.trim()) continue;
    const name = defaultAccountName(a.email).toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map(
    accounts.map((a) => {
      const name = accountName(a);
      const ambiguous = !a.nickname?.trim() && (counts.get(name.toLowerCase()) ?? 0) > 1;
      return [a.email, ambiguous ? a.email : name];
    }),
  );
}

/**
 * One account per set of calendars: which account stands for a shared calendar,
 * for each of the accounts that doesn't.
 *
 * Mail is per address — three iCloud custom-domain addresses are three inboxes
 * a person really does send from separately. Calendars aren't: all three sign
 * in as the same Apple account and see the same calendars, so listing them per
 * address would report every calendar and every event three times, and asking
 * which of the three to put a meeting on would be a question with no answer.
 *
 * The owner is the sign-in address itself when it's connected, and otherwise
 * the oldest connected sibling. An account that can't be used loses the job to
 * one that can, so a reconnect-needed row never blacks out the calendar for
 * addresses that still work. Returns email → owner's email, leaving owners out.
 */
export function calendarOwners(
  accounts: {
    provider: Provider;
    email: string;
    /** The address that signs in, when it isn't `email`. */
    loginEmail?: string;
    status?: ConnectedAccount["status"];
    connectedAt?: number;
  }[],
): Map<string, string> {
  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = `${a.provider}:${(a.loginEmail ?? a.email).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const owners = new Map<string, string>();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const signIn = key.slice(key.indexOf(":") + 1);
    const rank = (a: (typeof group)[number]) => [
      a.status && a.status !== "active" ? 1 : 0,
      a.email.toLowerCase() === signIn ? 0 : 1,
      a.connectedAt ?? 0,
    ];
    const [owner, ...rest] = [...group].sort((x, y) => {
      const [a, b] = [rank(x), rank(y)];
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      // Nothing left to separate them: the address, so the choice is stable.
      return x.email.localeCompare(y.email);
    });
    for (const a of rest) owners.set(a.email, owner.email);
  }
  return owners;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface MessageSummary {
  id: string;
  threadId: string;
  account: string;
  provider: Provider;
  from?: EmailAddress;
  to: EmailAddress[];
  subject: string;
  snippet: string;
  date?: string;
  isUnread?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  labels?: string[];
}

export interface Message extends MessageSummary {
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  /** Addresses a reply should go to when they differ from `from` (Reply-To header). */
  replyTo?: EmailAddress[];
  /** RFC 2822 Message-ID header — the value a reply puts in In-Reply-To. */
  messageId?: string;
  body: string;
  bodyHtml?: string;
  attachments?: Attachment[];
}

export interface Thread {
  id: string;
  account: string;
  provider: Provider;
  subject: string;
  messages: Message[];
}

export interface Label {
  id: string;
  name: string;
  type?: string;
}

export interface Attachment {
  /** Provider-scoped attachment id; only meaningful together with its message id. */
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Embedded in the body (e.g. a signature image) rather than a real enclosure. */
  inline?: boolean;
}

export interface AttachmentContent extends Attachment {
  /** Raw bytes, base64-encoded. */
  data: string;
}

export interface DraftSummary {
  id: string;
  account: string;
  provider: Provider;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  snippet: string;
  updatedAt?: string;
  /** Set when the draft is a reply sitting inside an existing thread. */
  threadId?: string;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Reply threading: provider thread id to reply within */
  threadId?: string;
  /** RFC 2822 Message-ID being replied to (gmail threading) */
  inReplyTo?: string;
}

export interface EmailProvider {
  readonly provider: Provider;
  readonly email: string;
  search(query: string, maxResults?: number): Promise<MessageSummary[]>;
  getThread(threadId: string): Promise<Thread>;
  getMessage(messageId: string): Promise<Message>;
  send(input: SendEmailInput): Promise<{ id: string }>;
  archive(messageId: string): Promise<void>;
  trash(messageId: string): Promise<void>;
  /** Restore a trashed message. Folder-based providers can only restore to the inbox. */
  untrash(messageId: string): Promise<void>;
  markRead(messageId: string, read: boolean): Promise<void>;
  /** Gmail star, Outlook flag, IMAP \Flagged — one concept, three names. */
  setStarred(messageId: string, starred: boolean): Promise<void>;
  setSpam(messageId: string, spam: boolean): Promise<void>;
  listLabels(): Promise<Label[]>;
  createLabel(name: string): Promise<Label>;
  /** Gmail: add/remove label ids. Outlook/iCloud: `add` moves to folder id (first entry). */
  modifyLabels(messageId: string, add: string[], remove: string[]): Promise<void>;
  /**
   * File a message under `destinationId` (a label or folder id from listLabels)
   * and take it out of the inbox — the same outcome on every provider.
   */
  move(messageId: string, destinationId: string): Promise<void>;
  createDraft(input: SendEmailInput): Promise<{ id: string }>;
  listDrafts(maxResults?: number): Promise<DraftSummary[]>;
  /** Replaces the draft wholesale; the returned id may differ from `draftId`. */
  updateDraft(draftId: string, input: SendEmailInput): Promise<{ id: string }>;
  sendDraft(draftId: string): Promise<{ id: string }>;
  deleteDraft(draftId: string): Promise<void>;
  listAttachments(messageId: string): Promise<Attachment[]>;
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentContent>;
}

export interface Calendar {
  id: string;
  account: string;
  provider: Provider;
  name: string;
  description?: string;
  /** IANA zone the calendar's floating times are interpreted in. */
  timeZone?: string;
  color?: string;
  isPrimary?: boolean;
  /** The user can read this calendar but not write to it (a shared feed). */
  readOnly?: boolean;
}

/**
 * An event boundary. All-day events carry `date` (YYYY-MM-DD) and timed ones
 * carry `dateTime`; the two are never both set. Keeping them apart rather than
 * normalising everything to an instant is what makes "all day on the 3rd" stay
 * the 3rd when it crosses a timezone.
 */
export interface EventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export type AttendeeResponse = "accepted" | "declined" | "tentative" | "needsAction";

export interface Attendee {
  email: string;
  name?: string;
  response: AttendeeResponse;
  optional?: boolean;
  organizer?: boolean;
  /** This is the connected user — the one whose RSVP respond_to_event sets. */
  self?: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  account: string;
  provider: Provider;
  summary: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  allDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  organizer?: EmailAddress;
  attendees?: Attendee[];
  /** Raw RRULE/EXDATE lines, as the provider states them. */
  recurrence?: string[];
  /** Set on one occurrence of a series; points at the series' own id. */
  recurringEventId?: string;
  url?: string;
  /** A video-call link pulled out of the provider's conferencing data. */
  conferencing?: string;
  /** Minutes before the start, one entry per reminder. */
  reminders?: number[];
  myResponse?: AttendeeResponse;
  created?: string;
  updated?: string;
  /** Concurrency token; CalDAV writes send it back as If-Match. */
  etag?: string;
}

export interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  attendees?: { email: string; name?: string; optional?: boolean }[];
  recurrence?: string[];
  reminders?: number[];
  /** Ask the provider to attach a video call (Google Meet). */
  addConferencing?: boolean;
}

/** Which occurrences of a recurring event a write applies to. */
export type RecurrenceScope = "this" | "following" | "all";

export interface BusyBlock {
  start: string;
  end: string;
  calendarId?: string;
  account?: string;
}

export interface ListEventsOptions {
  /** Omit to cover every calendar the account can see. */
  calendarIds?: string[];
  /** ISO 8601 window. Both ends required — an unbounded query is unaffordable. */
  from: string;
  to: string;
  maxResults?: number;
}

export interface CalendarProvider {
  readonly provider: Provider;
  readonly email: string;
  listCalendars(): Promise<Calendar[]>;
  listEvents(opts: ListEventsOptions): Promise<CalendarEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  searchEvents(query: string, opts: ListEventsOptions): Promise<CalendarEvent[]>;
  createEvent(calendarId: string, input: EventInput): Promise<CalendarEvent>;
  /**
   * Patch semantics: fields left undefined keep their current value, and
   * properties this codebase doesn't model survive untouched.
   */
  updateEvent(
    calendarId: string,
    eventId: string,
    patch: Partial<EventInput>,
    scope?: RecurrenceScope,
  ): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string, scope?: RecurrenceScope): Promise<void>;
  respondToEvent(
    calendarId: string,
    eventId: string,
    response: Exclude<AttendeeResponse, "needsAction">,
    comment?: string,
  ): Promise<void>;
  moveEvent(calendarId: string, eventId: string, toCalendarId: string): Promise<CalendarEvent>;
  freeBusy(opts: { calendarIds?: string[]; from: string; to: string }): Promise<BusyBlock[]>;
  createCalendar(name: string, opts?: { description?: string; timeZone?: string }): Promise<Calendar>;
  updateCalendar(
    calendarId: string,
    patch: { name?: string; description?: string; color?: string },
  ): Promise<Calendar>;
  deleteCalendar(calendarId: string): Promise<void>;
}

export class ProviderApiError extends Error {
  constructor(
    public readonly provider: Provider,
    public readonly status: number,
    message: string,
  ) {
    super(`[${provider} ${status}] ${message}`);
    this.name = "ProviderApiError";
  }
}
