import {
  EmailAddress,
  EmailProvider,
  Label,
  Message,
  MessageSummary,
  ProviderApiError,
  SendEmailInput,
  Thread,
} from "../types";

const BASE = "https://graph.microsoft.com/v1.0";

type GraphRecipient = { emailAddress: { name?: string; address: string } };
type GraphMessage = {
  id: string;
  conversationId: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  isRead?: boolean;
  categories?: string[];
  body?: { contentType: string; content: string };
};

function toAddress(r?: GraphRecipient): EmailAddress | undefined {
  return r ? { name: r.emailAddress.name, email: r.emailAddress.address } : undefined;
}

function toRecipients(emails: string[] | undefined): GraphRecipient[] {
  return (emails ?? []).map((e) => ({ emailAddress: { address: e } }));
}

export class OutlookProvider implements EmailProvider {
  readonly provider = "outlook" as const;

  constructor(
    readonly email: string,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  private async request<T>(path: string, init?: RequestInit, extraHeaders?: Record<string, string>): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new ProviderApiError("outlook", res.status, await res.text());
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private toSummary(msg: GraphMessage): MessageSummary {
    return {
      id: msg.id,
      threadId: msg.conversationId,
      account: this.email,
      provider: "outlook",
      from: toAddress(msg.from),
      to: (msg.toRecipients ?? []).map((r) => toAddress(r)!),
      subject: msg.subject ?? "(no subject)",
      snippet: msg.bodyPreview ?? "",
      date: msg.receivedDateTime,
      isUnread: msg.isRead === false,
      labels: msg.categories,
    };
  }

  private toMessage(msg: GraphMessage): Message {
    const isHtml = msg.body?.contentType?.toLowerCase() === "html";
    const content = msg.body?.content ?? "";
    return {
      ...this.toSummary(msg),
      cc: (msg.ccRecipients ?? []).map((r) => toAddress(r)!),
      body: isHtml ? content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : content,
      bodyHtml: isHtml ? content : undefined,
    };
  }

  async search(query: string, maxResults = 20): Promise<MessageSummary[]> {
    const res = await this.request<{ value: GraphMessage[] }>(
      `/me/messages?$search=${encodeURIComponent(`"${query.replace(/"/g, '\\"')}"`)}&$top=${maxResults}`,
      undefined,
      { ConsistencyLevel: "eventual" },
    );
    return res.value.map((m) => this.toSummary(m));
  }

  async getThread(threadId: string): Promise<Thread> {
    const res = await this.request<{ value: GraphMessage[] }>(
      `/me/messages?$filter=conversationId eq '${threadId.replace(/'/g, "''")}'&$orderby=receivedDateTime asc&$top=50`,
    );
    const messages = res.value.map((m) => this.toMessage(m));
    return {
      id: threadId,
      account: this.email,
      provider: "outlook",
      subject: messages[0]?.subject ?? "(no subject)",
      messages,
    };
  }

  async getMessage(messageId: string): Promise<Message> {
    return this.toMessage(await this.request<GraphMessage>(`/me/messages/${messageId}`));
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    if (input.threadId) {
      // Reply within a conversation: reply to its most recent message
      const thread = await this.getThread(input.threadId);
      const last = thread.messages[thread.messages.length - 1];
      if (last) {
        await this.request(`/me/messages/${last.id}/reply`, {
          method: "POST",
          body: JSON.stringify({
            message: { toRecipients: toRecipients(input.to) },
            comment: input.body,
          }),
        });
        return { id: last.id };
      }
    }
    await this.request(`/me/sendMail`, {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "Text", content: input.body },
          toRecipients: toRecipients(input.to),
          ccRecipients: toRecipients(input.cc),
          bccRecipients: toRecipients(input.bcc),
        },
      }),
    });
    return { id: "sent" };
  }

  async createDraft(input: SendEmailInput): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/me/messages`, {
      method: "POST",
      body: JSON.stringify({
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: toRecipients(input.to),
        ccRecipients: toRecipients(input.cc),
        bccRecipients: toRecipients(input.bcc),
      }),
    });
    return { id: res.id };
  }

  private async move(messageId: string, destinationId: string): Promise<void> {
    await this.request(`/me/messages/${messageId}/move`, {
      method: "POST",
      body: JSON.stringify({ destinationId }),
    });
  }

  async archive(messageId: string): Promise<void> {
    await this.move(messageId, "archive");
  }

  async trash(messageId: string): Promise<void> {
    await this.move(messageId, "deleteditems");
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    await this.request(`/me/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ isRead: read }),
    });
  }

  async listLabels(): Promise<Label[]> {
    const res = await this.request<{ value: { id: string; displayName: string }[] }>(
      `/me/mailFolders?$top=100`,
    );
    return res.value.map((f) => ({ id: f.id, name: f.displayName, type: "folder" }));
  }

  /** Outlook has folders, not labels: `add[0]` is treated as a destination folder id. */
  async modifyLabels(messageId: string, add: string[], _remove: string[]): Promise<void> {
    if (add[0]) await this.move(messageId, add[0]);
  }
}
