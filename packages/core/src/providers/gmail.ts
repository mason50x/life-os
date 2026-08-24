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

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
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
      labels: msg.labelIds,
    };
  }

  private toMessage(msg: GmailMessage): Message {
    const { text, html } = extractBodies(msg.payload);
    const headers = msg.payload?.headers;
    return {
      ...this.toSummary(msg),
      cc: parseAddressList(header(headers, "Cc")),
      body: text,
      bodyHtml: html,
    };
  }

  async search(query: string, maxResults = 20): Promise<MessageSummary[]> {
    const list = await this.request<{ messages?: { id: string }[] }>(
      `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    );
    const ids = list.messages ?? [];
    const messages = await Promise.all(
      ids.map((m) =>
        this.request<GmailMessage>(
          `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        ),
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

  async createDraft(input: SendEmailInput): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>(`/drafts`, {
      method: "POST",
      body: JSON.stringify({
        message: { raw: this.buildRaw(input), threadId: input.threadId },
      }),
    });
    return { id: res.id };
  }

  async archive(messageId: string): Promise<void> {
    await this.modifyLabels(messageId, [], ["INBOX"]);
  }

  async trash(messageId: string): Promise<void> {
    await this.request(`/messages/${messageId}/trash`, { method: "POST" });
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    await this.modifyLabels(messageId, read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
  }

  async listLabels(): Promise<Label[]> {
    const res = await this.request<{ labels: { id: string; name: string; type: string }[] }>(
      `/labels`,
    );
    return res.labels.map((l) => ({ id: l.id, name: l.name, type: l.type }));
  }

  async modifyLabels(messageId: string, add: string[], remove: string[]): Promise<void> {
    await this.request(`/messages/${messageId}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    });
  }
}
