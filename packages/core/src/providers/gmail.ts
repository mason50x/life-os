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

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Headers worth pulling on list responses, where a full fetch is too expensive. */
const SUMMARY_HEADERS = ["Subject", "From", "To", "Date"];

type GmailHeader = { name: string; value: string };
type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
  internalDate?: string;
};

function parseAddressList(raw?: string): EmailAddress[] {
  if (!raw) return [];
  // Split on commas not inside quotes or angle brackets
  return raw.split(/,(?![^<]*>|[^"]*"(?:[^"]*"[^"]*")*[^"]*$)/).flatMap((part) => {
    const m = part.trim().match(/^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/);
    if (!m) return [];
    return [{ name: m[1]?.trim() || undefined, email: m[2] }];
  });
}

function b64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function b64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractBodies(part: GmailPart | undefined): { text: string; html?: string } {
  let text = "";
  let html: string | undefined;
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !text) text = b64UrlDecode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64UrlDecode(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  if (!text && html) text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { text, html };
}

/** Attachment leaves are the parts that carry a filename and an attachmentId. */
function extractAttachments(part: GmailPart | undefined): Attachment[] {
  const found: Attachment[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      const disposition = header(p.headers, "Content-Disposition") ?? "";
      found.push({
        id: p.body.attachmentId,
        filename: p.filename,
        mimeType: p.mimeType ?? "application/octet-stream",
        size: p.body.size ?? 0,
        inline: /inline/i.test(disposition) || Boolean(header(p.headers, "Content-ID")),
      });
    }
    p.parts?.forEach(walk);
  };
  walk(part);
  return found;
}

export class GmailProvider implements EmailProvider {
  readonly provider = "gmail" as const;

  constructor(
    readonly email: string,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new ProviderApiError("gmail", res.status, await res.text());
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private toSummary(msg: GmailMessage): MessageSummary {
    const headers = msg.payload?.headers;
    return {
      id: msg.id,
      threadId: msg.threadId,
      account: this.email,
      provider: "gmail",
      from: parseAddressList(header(headers, "From"))[0],
      to: parseAddressList(header(headers, "To")),
      subject: header(headers, "Subject") ?? "(no subject)",
      snippet: msg.snippet ?? "",
      date: header(headers, "Date"),
      isUnread: msg.labelIds?.includes("UNREAD"),
      isStarred: msg.labelIds?.includes("STARRED"),
      labels: msg.labelIds,
    };
  }

  private toMessage(msg: GmailMessage): Message {
    const { text, html } = extractBodies(msg.payload);
    const headers = msg.payload?.headers;
    const attachments = extractAttachments(msg.payload);
    return {
      ...this.toSummary(msg),
      cc: parseAddressList(header(headers, "Cc")),
      replyTo: parseAddressList(header(headers, "Reply-To")),
      messageId: header(headers, "Message-ID") ?? header(headers, "Message-Id"),
      body: text,
      bodyHtml: html,
      hasAttachments: attachments.length > 0,
      attachments,
    };
  }

  async search(query: string, maxResults = 20): Promise<MessageSummary[]> {
    const list = await this.request<{ messages?: { id: string }[] }>(
      `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    );
    const ids = list.messages ?? [];
    const headerParams = SUMMARY_HEADERS.map((h) => `&metadataHeaders=${h}`).join("");
    const messages = await Promise.all(
      ids.map((m) =>
        this.request<GmailMessage>(`/messages/${m.id}?format=metadata${headerParams}`),
      ),
    );
    return messages.map((m) => this.toSummary(m));
  }

  async getThread(threadId: string): Promise<Thread> {
    const thread = await this.request<{ id: string; messages: GmailMessage[] }>(
      `/threads/${threadId}?format=full`,
    );
    const messages = thread.messages.map((m) => this.toMessage(m));
    return {
      id: thread.id,
      account: this.email,
      provider: "gmail",
      subject: messages[0]?.subject ?? "(no subject)",
      messages,
    };
  }

  async getMessage(messageId: string): Promise<Message> {
    return this.toMessage(await this.request<GmailMessage>(`/messages/${messageId}?format=full`));
  }

  private buildRaw(input: SendEmailInput): string {
    const lines = [
      `From: ${this.email}`,
      `To: ${input.to.join(", ")}`,
      ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
      ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
      `Subject: ${input.subject}`,
      ...(input.inReplyTo
        ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]
        : []),
      'Content-Type: text/plain; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      input.body,
    ];
    return b64UrlEncode(lines.join("\r\n"));
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: this.buildRaw(input), threadId: input.threadId }),
    });
    return { id: res.id };
  }

  async archive(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, [], ["INBOX"]);
  }

  async trash(messageId: string): Promise<void> {
    await this.request(`/messages/${messageId}/trash`, { method: "POST" });
  }

  async untrash(messageId: string): Promise<void> {
    await this.request(`/messages/${messageId}/untrash`, { method: "POST" });
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    await this.modifyLabels(messageId, read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
  }

  async setStarred(messageId: string, starred: boolean): Promise<void> {
    await this.modifyLabels(messageId, starred ? ["STARRED"] : [], starred ? [] : ["STARRED"]);
  }

  async setSpam(messageId: string, spam: boolean): Promise<void> {
    await this.modifyLabels(
      messageId,
      spam ? ["SPAM"] : ["INBOX"],
      spam ? ["INBOX"] : ["SPAM"],
    );
  }

  async listLabels(): Promise<Label[]> {
    const res = await this.request<{ labels: { id: string; name: string; type: string }[] }>(
      `/labels`,
    );
    return res.labels.map((l) => ({ id: l.id, name: l.name, type: l.type }));
  }

  async createLabel(name: string): Promise<Label> {
    const res = await this.request<{ id: string; name: string; type?: string }>(`/labels`, {
      method: "POST",
      body: JSON.stringify({
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    return { id: res.id, name: res.name, type: res.type ?? "user" };
  }

  async modifyLabels(messageId: string, add: string[], remove: string[]): Promise<void> {
    await this.request(`/messages/${messageId}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    });
  }

  /** Gmail files by label, so a move is "apply the label, drop out of the inbox". */
  async move(messageId: string, destinationId: string): Promise<void> {
    await this.modifyLabels(messageId, [destinationId], ["INBOX"]);
  }

  async createDraft(input: SendEmailInput): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/drafts`, {
      method: "POST",
      body: JSON.stringify({
        message: { raw: this.buildRaw(input), threadId: input.threadId },
      }),
    });
    return { id: res.id };
  }

  async listDrafts(maxResults = 20): Promise<DraftSummary[]> {
    const list = await this.request<{ drafts?: { id: string; message?: { id: string } }[] }>(
      `/drafts?maxResults=${maxResults}`,
    );
    const headerParams = [...SUMMARY_HEADERS, "Cc"].map((h) => `&metadataHeaders=${h}`).join("");
    return Promise.all(
      (list.drafts ?? []).map(async (d) => {
        const msg = d.message?.id
          ? await this.request<GmailMessage>(`/messages/${d.message.id}?format=metadata${headerParams}`)
          : undefined;
        const headers = msg?.payload?.headers;
        return {
          id: d.id,
          account: this.email,
          provider: "gmail" as const,
          to: parseAddressList(header(headers, "To")),
          cc: parseAddressList(header(headers, "Cc")),
          subject: header(headers, "Subject") ?? "(no subject)",
          snippet: msg?.snippet ?? "",
          updatedAt: header(headers, "Date"),
          threadId: msg?.threadId,
        };
      }),
    );
  }

  async updateDraft(draftId: string, input: SendEmailInput): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/drafts/${draftId}`, {
      method: "PUT",
      body: JSON.stringify({
        id: draftId,
        message: { raw: this.buildRaw(input), threadId: input.threadId },
      }),
    });
    return { id: res.id };
  }

  async sendDraft(draftId: string): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/drafts/send`, {
      method: "POST",
      body: JSON.stringify({ id: draftId }),
    });
    return { id: res.id };
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.request(`/drafts/${draftId}`, { method: "DELETE" });
  }

  async listAttachments(messageId: string): Promise<Attachment[]> {
    const msg = await this.request<GmailMessage>(`/messages/${messageId}?format=full`);
    return extractAttachments(msg.payload);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentContent> {
    const meta = (await this.listAttachments(messageId)).find((a) => a.id === attachmentId);
    if (!meta) {
      throw new ProviderApiError("gmail", 404, `No attachment ${attachmentId} on ${messageId}`);
    }
    const res = await this.request<{ data: string; size: number }>(
      `/messages/${messageId}/attachments/${attachmentId}`,
    );
    // Gmail hands back base64url; normalise to standard base64.
    const data = Buffer.from(
      res.data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("base64");
    return { ...meta, size: res.size ?? meta.size, data };
  }
}
