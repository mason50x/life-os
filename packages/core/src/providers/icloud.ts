import { ImapFlow, type FetchMessageObject, type MessageStructureObject, type SearchObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { createTransport } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
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

// Official server settings: https://support.apple.com/102525
const IMAP_HOST = "imap.mail.me.com";
const IMAP_PORT = 993;
const SMTP_HOST = "smtp.mail.me.com";
const SMTP_PORT = 587;

const THREAD_MAX_MESSAGES = 20;
const THREAD_MAX_REFS = 8;

// iCloud folder names used when the server doesn't advertise SPECIAL-USE.
const SPECIAL_FALLBACKS: Record<string, string> = {
  "\\Sent": "Sent Messages",
  "\\Trash": "Deleted Messages",
  "\\Drafts": "Drafts",
  "\\Archive": "Archive",
  "\\Junk": "Junk",
};

/**
 * IMAP UIDs are only unique per mailbox, so message/thread ids encode both:
 * base64url(mailbox path) + "." + uid.
 */
function encodeId(mailbox: string, uid: number): string {
  return `${Buffer.from(mailbox, "utf8").toString("base64url")}.${uid}`;
}

function decodeId(id: string): { mailbox: string; uid: number } {
  const dot = id.lastIndexOf(".");
  const uid = Number(id.slice(dot + 1));
  if (dot < 1 || !Number.isInteger(uid) || uid < 1) {
    throw new ProviderApiError("icloud", 400, `Invalid iCloud message id: ${id}`);
  }
  return { mailbox: Buffer.from(id.slice(0, dot), "base64url").toString("utf8"), uid };
}

function toAddresses(value: AddressObject | AddressObject[] | undefined): EmailAddress[] {
  const objs = Array.isArray(value) ? value : value ? [value] : [];
  return objs.flatMap((o) =>
    o.value.flatMap((a) => (a.address ? [{ name: a.name || undefined, email: a.address }] : [])),
  );
}

function envelopeAddresses(
  list: { name?: string; address?: string }[] | undefined,
): EmailAddress[] {
  return (list ?? []).flatMap((a) =>
    a.address ? [{ name: a.name || undefined, email: a.address }] : [],
  );
}

/** Decode a fetched BODYPART buffer according to its Content-Transfer-Encoding. */
function decodePart(buf: Buffer, encoding?: string): string {
  const enc = encoding?.toLowerCase();
  if (enc === "base64") return Buffer.from(buf.toString("ascii"), "base64").toString("utf8");
  if (enc === "quoted-printable") {
    return buf
      .toString("ascii")
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return buf.toString("utf8");
}

/** Find the first text/plain (fallback text/html) leaf part of a body structure. */
function findTextPart(
  node: MessageStructureObject | undefined,
  want: string,
): MessageStructureObject | undefined {
  if (!node) return undefined;
  if (node.type === want) return node;
  for (const child of node.childNodes ?? []) {
    const hit = findTextPart(child, want);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Translate a Gmail-flavored query into an IMAP SearchObject. Supported:
 * from:/to:/subject: (quoted values ok), is:unread, is:read, newer_than:7d,
 * older_than:30d, before:/after:YYYY/MM/DD, in:<folder>; leftover words
 * become a full-text search. Returns the target mailbox alias alongside.
 */
function parseQuery(query: string): { search: SearchObject; inFolder?: string } {
  const search: SearchObject = {};
  let inFolder: string | undefined;
  const freeText: string[] = [];

  const tokens = query.match(/(?:[\w-]+:)?"[^"]*"|\S+/g) ?? [];
  for (const token of tokens) {
    const m = token.match(/^([\w-]+):(.+)$/s);
    const strip = (s: string) => s.replace(/^"|"$/g, "");
    if (!m) {
      freeText.push(strip(token));
      continue;
    }
    const [, op, rawValue] = m;
    const value = strip(rawValue);
    const days = /^(\d+)d$/.exec(value);
    switch (op.toLowerCase()) {
      case "from":
        search.from = value;
        break;
      case "to":
        search.to = value;
        break;
      case "subject":
        search.subject = value;
        break;
      case "is":
        if (value === "unread") search.seen = false;
        else if (value === "read") search.seen = true;
        else freeText.push(value);
        break;
      case "newer_than":
        if (days) search.since = new Date(Date.now() - Number(days[1]) * 86_400_000);
        break;
      case "older_than":
        if (days) search.before = new Date(Date.now() - Number(days[1]) * 86_400_000);
        break;
      case "before":
      case "after": {
        const d = new Date(value.replace(/\//g, "-"));
        if (!Number.isNaN(d.getTime())) search[op === "before" ? "before" : "since"] = d;
        break;
      }
      case "in":
        inFolder = value;
        break;
      default:
        freeText.push(strip(token));
    }
  }
  if (freeText.length) search.text = freeText.join(" ");
  if (Object.keys(search).length === 0 && !inFolder) search.all = true;
  return { search, inFolder };
}

export class IcloudProvider implements EmailProvider {
  readonly provider = "icloud" as const;

  constructor(
    readonly email: string,
    /** Returns the decrypted app-specific password (createProvider's token slot). */
    private readonly getPassword: () => Promise<string>,
    /**
     * Address used to sign in to Apple — the primary iCloud address. When
     * `email` is an iCloud+ custom-domain (or alias) send-as address, all mail
     * still lives in the primary account's mailbox and authentication must use
     * the primary address. Defaults to `email`.
     */
    private readonly loginEmail: string = email,
  ) {}

  /** Verify credentials with a live IMAP login (used by the connect flow). */
  static async verify(loginEmail: string, password: string): Promise<void> {
    const provider = new IcloudProvider(loginEmail, async () => password);
    await provider.withImap(async () => undefined);
  }

  /**
   * Serverless-friendly lifecycle: each operation opens a connection, runs,
   * and logs out — no sockets survive the request. Apple: the IMAP username is
   * "usually the name of your iCloud Mail email address ... if your client
   * can't connect using just the name, try using the full address".
   */
  private async withImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const pass = await this.getPassword();
    const localPart = this.loginEmail.split("@")[0];
    const usernames = [...new Set([localPart, this.loginEmail])];

    let client: ImapFlow | undefined;
    let lastAuthError: unknown;
    for (const user of usernames) {
      const candidate = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: { user, pass },
        logger: false,
      });
      try {
        await candidate.connect();
        client = candidate;
        break;
      } catch (e) {
        lastAuthError = e;
        if (!(e instanceof Error && "authenticationFailed" in e)) {
          throw new ProviderApiError("icloud", 502, `IMAP connection failed: ${e}`);
        }
      }
    }
    if (!client) {
      throw new ProviderApiError(
        "icloud",
        401,
        `iCloud sign-in failed for ${this.loginEmail}. Check the address and app-specific password ` +
          `(it may have been revoked at account.apple.com). (${lastAuthError})`,
      );
    }
    try {
      return await fn(client);
    } finally {
      await client.logout().catch(() => client!.close());
    }
  }

  /** Resolve a special-use mailbox ("\Sent", "\Trash", ...) to its real path. */
  private async specialPath(client: ImapFlow, use: keyof typeof SPECIAL_FALLBACKS): Promise<string> {
    const boxes = await client.list();
    return boxes.find((b) => b.specialUse === use)?.path ?? SPECIAL_FALLBACKS[use];
  }

  private toSummary(mailbox: string, msg: FetchMessageObject, snippet = ""): MessageSummary {
    const env = msg.envelope;
    const id = encodeId(mailbox, msg.uid);
    return {
      id,
      threadId: id,
      account: this.email,
      provider: "icloud",
      from: envelopeAddresses(env?.from)[0],
      to: envelopeAddresses(env?.to),
      subject: env?.subject ?? "(no subject)",
      snippet,
      date: env?.date ? new Date(env.date).toISOString() : undefined,
      isUnread: msg.flags ? !msg.flags.has("\\Seen") : undefined,
      labels: [mailbox],
    };
  }

  private toMessage(
    mailbox: string,
    uid: number,
    parsed: ParsedMail,
    flags?: Set<string>,
  ): Message {
    const id = encodeId(mailbox, uid);
    const text = parsed.text?.trim()
      ? parsed.text
      : (parsed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      id,
      threadId: id,
      account: this.email,
      provider: "icloud",
      from: toAddresses(parsed.from)[0],
      to: toAddresses(parsed.to),
      cc: toAddresses(parsed.cc),
      subject: parsed.subject ?? "(no subject)",
      snippet: text.replace(/\s+/g, " ").trim().slice(0, 200),
      date: parsed.date?.toISOString(),
      isUnread: flags ? !flags.has("\\Seen") : undefined,
      labels: [mailbox],
      body: text,
      bodyHtml: parsed.html || undefined,
    };
  }

  async search(query: string, maxResults = 20): Promise<MessageSummary[]> {
    const { search, inFolder } = parseQuery(query);
    return this.withImap(async (client) => {
      let mailbox = "INBOX";
      if (inFolder) {
        const aliases: Record<string, keyof typeof SPECIAL_FALLBACKS> = {
          sent: "\\Sent",
          trash: "\\Trash",
          drafts: "\\Drafts",
          archive: "\\Archive",
          junk: "\\Junk",
          spam: "\\Junk",
        };
        const special = aliases[inFolder.toLowerCase()];
        mailbox = special
          ? await this.specialPath(client, special)
          : inFolder.toLowerCase() === "inbox"
            ? "INBOX"
            : inFolder;
      }

      const lock = await client.getMailboxLock(mailbox);
      try {
        const uids = await client.search(search, { uid: true });
        if (!uids || uids.length === 0) return [];
        // Highest UIDs are newest; return the most recent matches.
        const recent = uids.sort((a, b) => b - a).slice(0, maxResults);

        const found: { summary: MessageSummary; uid: number; part?: MessageStructureObject }[] = [];
        for await (const msg of client.fetch(
          recent.join(","),
          { uid: true, envelope: true, flags: true, bodyStructure: true },
          { uid: true },
        )) {
          found.push({
            summary: this.toSummary(mailbox, msg),
            uid: msg.uid,
            part: findTextPart(msg.bodyStructure, "text/plain"),
          });
        }

        // Second pass: short body snippets (best-effort, never fatal).
        await Promise.all(
          found.map(async ({ summary, uid, part }) => {
            if (!part) return;
            try {
              const key = part.part ?? "1";
              const res = await client.fetchOne(
                String(uid),
                { uid: true, bodyParts: [{ key, maxLength: 600 }] },
                { uid: true },
              );
              const buf = res && res.bodyParts?.get(key);
              if (buf) {
                summary.snippet = decodePart(buf, part.encoding)
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 200);
              }
            } catch {
              /* snippet is a nicety */
            }
          }),
        );
        return found
          .map((f) => f.summary)
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(messageId: string): Promise<Message> {
    const { mailbox, uid } = decodeId(messageId);
    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
        if (!msg || !msg.source) {
          throw new ProviderApiError("icloud", 404, `Message not found: ${messageId}`);
        }
        return this.toMessage(mailbox, uid, await simpleParser(msg.source), msg.flags);
      } finally {
        lock.release();
      }
    });
  }

  /**
   * IMAP has no server-side threads. A thread id is its anchor message's id;
   * the rest of the conversation is reconstructed from Message-ID/References
   * across the anchor's mailbox and Sent.
   */
  async getThread(threadId: string): Promise<Thread> {
    const anchor = decodeId(threadId);
    return this.withImap(async (client) => {
      const collected = new Map<string, Message>(); // keyed by RFC Message-ID (or synthetic)

      const anchorLock = await client.getMailboxLock(anchor.mailbox);
      let refs: string[];
      let anchorMsgId: string | undefined;
      try {
        const msg = await client.fetchOne(
          String(anchor.uid),
          { uid: true, source: true, flags: true },
          { uid: true },
        );
        if (!msg || !msg.source) {
          throw new ProviderApiError("icloud", 404, `Thread not found: ${threadId}`);
        }
        const parsed = await simpleParser(msg.source);
        anchorMsgId = parsed.messageId;
        const rawRefs = Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
            ? [parsed.references]
            : [];
        refs = [...new Set([...rawRefs, ...(anchorMsgId ? [anchorMsgId] : [])])].slice(
          -THREAD_MAX_REFS,
        );
        collected.set(anchorMsgId ?? threadId, this.toMessage(anchor.mailbox, anchor.uid, parsed, msg.flags));
      } finally {
        anchorLock.release();
      }

      // Related = messages whose Message-ID is in our References chain, or
      // which themselves reference the anchor.
      const orTerms: SearchObject[] = [
        ...refs.map((r) => ({ header: { "message-id": r } })),
        ...(anchorMsgId ? [{ header: { references: anchorMsgId } }] : []),
      ];
      if (orTerms.length > 0) {
        const sentPath = await this.specialPath(client, "\\Sent");
        const mailboxes = [...new Set([anchor.mailbox, sentPath])];
        for (const mailbox of mailboxes) {
          const lock = await client.getMailboxLock(mailbox).catch(() => null);
          if (!lock) continue;
          try {
            const query: SearchObject = orTerms.length === 1 ? orTerms[0] : { or: orTerms };
            const uids = ((await client.search(query, { uid: true })) || [])
              .sort((a, b) => a - b)
              .slice(0, THREAD_MAX_MESSAGES);
            for (const uid of uids) {
              if (mailbox === anchor.mailbox && uid === anchor.uid) continue;
              const msg = await client.fetchOne(
                String(uid),
                { uid: true, source: true, flags: true },
                { uid: true },
              );
              if (!msg || !msg.source) continue;
              const parsed = await simpleParser(msg.source);
              const key = parsed.messageId ?? encodeId(mailbox, uid);
              if (!collected.has(key)) {
                collected.set(key, this.toMessage(mailbox, uid, parsed, msg.flags));
              }
            }
          } finally {
            lock.release();
          }
        }
      }

      const messages = [...collected.values()].sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? ""),
      );
      return {
        id: threadId,
        account: this.email,
        provider: "icloud",
        subject: messages[0]?.subject ?? "(no subject)",
        messages,
      };
    });
  }

  /** Resolve reply headers when the caller passed a threadId but no Message-ID. */
  private async replyHeaders(
    input: SendEmailInput,
  ): Promise<{ inReplyTo?: string; references?: string }> {
    if (input.inReplyTo) return { inReplyTo: input.inReplyTo, references: input.inReplyTo };
    if (!input.threadId) return {};
    const { mailbox, uid } = decodeId(input.threadId);
    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(String(uid), { uid: true, envelope: true }, { uid: true });
        const messageId = msg ? msg.envelope?.messageId : undefined;
        return messageId ? { inReplyTo: messageId, references: messageId } : {};
      } finally {
        lock.release();
      }
    });
  }

  private async buildRaw(input: SendEmailInput): Promise<Buffer> {
    const reply = await this.replyHeaders(input);
    const composer = new MailComposer({
      from: this.email,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.body,
      inReplyTo: reply.inReplyTo,
      references: reply.references,
    });
    return composer.compile().build();
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const raw = await this.buildRaw(input);
    const pass = await this.getPassword();
    // Apple: SMTP username is the full (primary) address; port 587 with
    // STARTTLS. The From/envelope address may be any alias or custom-domain
    // address registered on the account (this.email).
    const transport = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      requireTLS: true,
      auth: { user: this.loginEmail, pass },
    });
    try {
      await transport.sendMail({
        envelope: { from: this.email, to: [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])] },
        raw,
      });
    } catch (e) {
      throw new ProviderApiError("icloud", 502, `SMTP send failed: ${e}`);
    } finally {
      transport.close();
    }

    // iCloud doesn't copy SMTP-sent mail to Sent; append it ourselves (best-effort).
    try {
      return await this.withImap(async (client) => {
        const sentPath = await this.specialPath(client, "\\Sent");
        const res = await client.append(sentPath, raw, ["\\Seen"]);
        return { id: res && res.uid ? encodeId(res.destination, res.uid) : "sent" };
      });
    } catch {
      return { id: "sent" };
    }
  }

  async createDraft(input: SendEmailInput): Promise<{ id: string }> {
    const raw = await this.buildRaw(input);
    return this.withImap(async (client) => {
      const draftsPath = await this.specialPath(client, "\\Drafts");
      const res = await client.append(draftsPath, raw, ["\\Draft"]);
      if (!res) throw new ProviderApiError("icloud", 502, "Could not save draft");
      return { id: res.uid ? encodeId(res.destination, res.uid) : "draft" };
    });
  }

  private async moveTo(messageId: string, use: keyof typeof SPECIAL_FALLBACKS): Promise<void> {
    const { mailbox, uid } = decodeId(messageId);
    await this.withImap(async (client) => {
      const destination = await this.specialPath(client, use);
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageMove(String(uid), destination, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async archive(messageId: string): Promise<void> {
    await this.moveTo(messageId, "\\Archive");
  }

  async trash(messageId: string): Promise<void> {
    await this.moveTo(messageId, "\\Trash");
  }

  async markRead(messageId: string, read: boolean): Promise<void> {
    const { mailbox, uid } = decodeId(messageId);
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        if (read) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async listLabels(): Promise<Label[]> {
    return this.withImap(async (client) => {
      const boxes = await client.list();
      return boxes.map((b) => ({
        id: b.path,
        name: b.name,
        type: b.specialUse ? b.specialUse.replace(/^\\/, "").toLowerCase() : "folder",
      }));
    });
  }

  /** iCloud has folders, not labels: `add[0]` is treated as a destination mailbox path. */
  async modifyLabels(messageId: string, add: string[], _remove: string[]): Promise<void> {
    if (!add[0]) return;
    const { mailbox, uid } = decodeId(messageId);
    const destination = add[0];
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageMove(String(uid), destination, { uid: true });
      } finally {
        lock.release();
      }
    });
  }
}
