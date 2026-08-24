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
  labels?: string[];
}

export interface Message extends MessageSummary {
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  body: string;
  bodyHtml?: string;
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
  createDraft(input: SendEmailInput): Promise<{ id: string }>;
  archive(messageId: string): Promise<void>;
  trash(messageId: string): Promise<void>;
  markRead(messageId: string, read: boolean): Promise<void>;
  listLabels(): Promise<Label[]>;
  /** Gmail: add/remove label ids. Outlook/iCloud: `add` moves to folder id (first entry). */
  modifyLabels(messageId: string, add: string[], remove: string[]): Promise<void>;
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
