import {
  Attachment,
  AttachmentContent,
  DraftSummary,
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
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  receivedDateTime?: string;
  lastModifiedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  flag?: { flagStatus?: string };
  categories?: string[];
  body?: { contentType: string; content: string };
};
type GraphAttachment = {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string;
  "@odata.type"?: string;
};

function toAddress(r?: GraphRecipient): EmailAddress | undefined {
  return r ? { name: r.emailAddress.name, email: r.emailAddress.address } : undefined;
}

function toRecipients(emails: string[] | undefined): GraphRecipient[] {
  return (emails ?? []).map((e) => ({ emailAddress: { address: e } }));
}

function toAttachment(a: GraphAttachment): Attachment {
  return {
    id: a.id,
    filename: a.name ?? "(unnamed)",
    mimeType: a.contentType ?? "application/octet-stream",
    size: a.size ?? 0,
    inline: a.isInline,
  };
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
      isStarred: msg.flag?.flagStatus === "flagged",
      hasAttachments: msg.hasAttachments,
      labels: msg.categories,
    };
  }

  private toMessage(msg: GraphMessage): Message {
    const isHtml = msg.body?.contentType?.toLowerCase() === "html";
    const content = msg.body?.content ?? "";
    return {
      ...this.toSummary(msg),
      cc: (msg.ccRecipients ?? []).map((r) => toAddress(r)!),
      replyTo: (msg.replyTo ?? []).map((r) => toAddress(r)!),
      messageId: msg.internetMessageId,
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
    const msg = await this.request<GraphMessage>(`/me/messages/${messageId}`);
    const message = this.toMessage(msg);
    if (msg.hasAttachments) message.attachments = await this.listAttachments(messageId);
    return message;
  }

  private draftBody(input: SendEmailInput) {
    return {
      subject: input.subject,
      body: { contentType: "Text", content: input.body },
      toRecipients: toRecipients(input.to),
      ccRecipients: toRecipients(input.cc),
      bccRecipients: toRecipients(input.bcc),
    };
  }

  /**
   * Graph won't let a caller set conversationId, so a reply has to start from
   * createReply on a message already in the thread. Everything the caller
   * asked for (subject, cc, bcc, body) is then patched over the stub Graph
   * generated, which is why this can't just be sendMail with a thread id.
   *
   * Graph returns no usable id for sent mail — the item is re-created in Sent
   * Items — so both paths report an empty id rather than inventing one.
   */
  async send(input: SendEmailInput): Promise<{ id: string }> {
    if (input.threadId) {
      const draft = await this.replyDraft(input.threadId);
      await this.request(`/me/messages/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify(this.draftBody(input)),
      });
      await this.request(`/me/messages/${draft.id}/send`, { method: "POST" });
      return { id: "" };
    }
    await this.request(`/me/sendMail`, {
      method: "POST",
      body: JSON.stringify({ message: this.draftBody(input) }),
    });
    return { id: "" };
  }

  private async moveTo(messageId: string, destinationId: string): Promise<void> {
    await this.request(`/me/messages/${messageId}/move`, {
      method: "POST",
      body: JSON.stringify({ destinationId }),
    });
  }

  /** A folder move already takes the message out of the inbox. */
  async move(messageId: string, destinationId: string): Promise<void> {
    await this.moveTo(messageId, destinationId);
  }

  async archive(messageId: string): Promise<void> {
    await this.moveTo(messageId, "archive");
  }

  async trash(messageId: string): Promise<void> {
    await this.moveTo(messageId, "deleteditems");
  }

  /** Folders carry no memory of where a message came from — the inbox is the only sane target. */
  async untrash(messageId: string): Promise<void> {
    await this.moveTo(messageId, "inbox");
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    await this.request(`/me/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ isRead: read }),
    });
  }

  async setStarred(messageId: string, starred: boolean): Promise<void> {
    await this.request(`/me/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ flag: { flagStatus: starred ? "flagged" : "notFlagged" } }),
    });
  }

  async setSpam(messageId: string, spam: boolean): Promise<void> {
    await this.moveTo(messageId, spam ? "junkemail" : "inbox");
  }

  async listLabels(): Promise<Label[]> {
    const res = await this.request<{ value: { id: string; displayName: string }[] }>(
      `/me/mailFolders?$top=100`,
    );
    return res.value.map((f) => ({ id: f.id, name: f.displayName, type: "folder" }));
  }

  async createLabel(name: string): Promise<Label> {
    const res = await this.request<{ id: string; displayName: string }>(`/me/mailFolders`, {
      method: "POST",
      body: JSON.stringify({ displayName: name }),
    });
    return { id: res.id, name: res.displayName, type: "folder" };
  }

  /** Outlook has folders, not labels: `add[0]` is treated as a destination folder id. */
  async modifyLabels(messageId: string, add: string[], _remove: string[]): Promise<void> {
    if (add[0]) await this.moveTo(messageId, add[0]);
  }

  async createDraft(input: SendEmailInput): Promise<{ id: string }> {
    // A reply draft has to descend from createReply to land in the thread;
    // a fresh draft is just a message created in the Drafts folder.
    if (input.threadId) {
      const draft = await this.replyDraft(input.threadId);
      await this.request(`/me/messages/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify(this.draftBody(input)),
      });
      return { id: draft.id };
    }
    const res = await this.request<{ id: string }>(`/me/messages`, {
      method: "POST",
      body: JSON.stringify(this.draftBody(input)),
    });
    return { id: res.id };
  }

  private async replyDraft(threadId: string): Promise<{ id: string }> {
    const thread = await this.getThread(threadId);
    const last = thread.messages[thread.messages.length - 1];
    if (!last) throw new ProviderApiError("outlook", 404, `Thread not found: ${threadId}`);
    return this.request<{ id: string }>(`/me/messages/${last.id}/createReply`, { method: "POST" });
  }

  async listDrafts(maxResults = 20): Promise<DraftSummary[]> {
    const res = await this.request<{ value: GraphMessage[] }>(
      `/me/mailFolders/drafts/messages?$top=${maxResults}&$orderby=lastModifiedDateTime desc`,
    );
    return res.value.map((m) => ({
      id: m.id,
      account: this.email,
      provider: "outlook" as const,
      to: (m.toRecipients ?? []).map((r) => toAddress(r)!),
      cc: (m.ccRecipients ?? []).map((r) => toAddress(r)!),
      subject: m.subject ?? "(no subject)",
      snippet: m.bodyPreview ?? "",
      updatedAt: m.lastModifiedDateTime,
      threadId: m.conversationId,
    }));
  }

  async updateDraft(draftId: string, input: SendEmailInput): Promise<{ id: string }> {
    await this.request(`/me/messages/${draftId}`, {
      method: "PATCH",
      body: JSON.stringify(this.draftBody(input)),
    });
    return { id: draftId };
  }

  async sendDraft(draftId: string): Promise<{ id: string }> {
    await this.request(`/me/messages/${draftId}/send`, { method: "POST" });
    return { id: "" };
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.request(`/me/messages/${draftId}`, { method: "DELETE" });
  }

  async listAttachments(messageId: string): Promise<Attachment[]> {
    const res = await this.request<{ value: GraphAttachment[] }>(
      `/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return res.value.map(toAttachment);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentContent> {
    const a = await this.request<GraphAttachment>(
      `/me/messages/${messageId}/attachments/${attachmentId}`,
    );
    if (!a.contentBytes) {
      throw new ProviderApiError(
        "outlook",
        415,
        `Attachment "${a.name ?? attachmentId}" is a ${a["@odata.type"] ?? "non-file"} attachment ` +
          `(a linked file or an embedded message), which has no downloadable bytes.`,
      );
    }
    return { ...toAttachment(a), data: a.contentBytes };
  }
}
