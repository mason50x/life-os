export type Provider = "gmail" | "outlook" | "icloud";

/** Providers connected via OAuth (iCloud uses an app-specific password instead). */
export type OAuthProvider = Exclude<Provider, "icloud">;

export interface ConnectedAccount {
  id: string;
  userId: string;
  provider: Provider;
  email: string;
  displayName?: string;
  status: "active" | "needs_reauth" | "disconnected";
  connectedAt: number;
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
