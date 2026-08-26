import { ImapFlow, type FetchMessageObject, type MessageStructureObject, type SearchObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { createTransport } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
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

/** Same as decodePart, but keeps the bytes intact for binary attachments. */
function decodePartBuffer(buf: Buffer, encoding?: string): Buffer {
  const enc = encoding?.toLowerCase();
  if (enc === "base64") return Buffer.from(buf.toString("ascii"), "base64");
  if (enc === "quoted-printable") return Buffer.from(decodePart(buf, enc), "utf8");
  return buf;
}

/**
 * Attachment leaves of a body structure, keyed by IMAP part number — that
 * part number is the attachment id an iCloud account hands back.
 */
function structureAttachments(
  node: MessageStructureObject | undefined,
): (Attachment & { encoding?: string })[] {
  const found: (Attachment & { encoding?: string })[] = [];
  const walk = (n: MessageStructureObject | undefined) => {
    if (!n) return;
    const params = (n.parameters ?? {}) as Record<string, string>;
    const dispParams = (n.dispositionParameters ?? {}) as Record<string, string>;
    const filename = dispParams.filename ?? params.name;
    const isLeaf = !n.childNodes?.length;
    if (isLeaf && (n.disposition === "attachment" || filename)) {
      found.push({
        id: n.part ?? "1",
        filename: filename ?? `part-${n.part ?? "1"}`,
        mimeType: n.type ?? "application/octet-stream",
        size: n.size ?? 0,
        inline: n.disposition === "inline",
        encoding: n.encoding,
      });
    }
    n.childNodes?.forEach(walk);
  };
  walk(node);
  return found;
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
      isStarred: msg.flags ? msg.flags.has("\\Flagged") : undefined,
      hasAttachments: msg.bodyStructure
        ? structureAttachments(msg.bodyStructure).length > 0
        : undefined,
      labels: [mailbox],
    };
  }

  private toMessage(
    mailbox: string,
    uid: number,
    parsed: ParsedMail,
    flags?: Set<string>,
    /** Body structure, when fetched — the only source of usable attachment part ids. */
    structure?: MessageStructureObject,
  ): Message {
    const attachments = structure
      ? structureAttachments(structure).map(({ encoding: _e, ...a }) => a)
      : undefined;
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
      isStarred: flags ? flags.has("\\Flagged") : undefined,
      replyTo: toAddresses(parsed.replyTo),
      messageId: parsed.messageId,
      labels: [mailbox],
      body: text,
      bodyHtml: parsed.html || undefined,
      hasAttachments: attachments
        ? attachments.length > 0
        : (parsed.attachments ?? []).length > 0,
      ...(attachments ? { attachments } : {}),
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
        const msg = await client.fetchOne(
          String(uid),
          { uid: true, source: true, flags: true, bodyStructure: true },
          { uid: true },
        );
        if (!msg || !msg.source) {
          throw new ProviderApiError("icloud", 404, `Message not found: ${messageId}`);
        }
        return this.toMessage(
          mailbox,
          uid,
          await simpleParser(msg.source),
          msg.flags,
          msg.bodyStructure,
        );
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

  /**
   * Hand a fully composed message to Apple's SMTP server, then file a copy in
   * Sent — iCloud doesn't do that for SMTP-submitted mail the way a webmail
   * client would, so the sent copy is ours to make.
   */
  private async smtpSend(raw: Buffer, recipients: string[]): Promise<{ id: string }> {
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
      await transport.sendMail({ envelope: { from: this.email, to: recipients }, raw });
    } catch (e) {
      throw new ProviderApiError("icloud", 502, `SMTP send failed: ${e}`);
    } finally {
      transport.close();
    }

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

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const raw = await this.buildRaw(input);
    return this.smtpSend(raw, [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])]);
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

  private async moveToPath(messageId: string, destination: string): Promise<void> {
    const { mailbox, uid } = decodeId(messageId);
    if (mailbox === destination) return;
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageMove(String(uid), destination, { uid: true });
      } finally {
        lock.release();
      }
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

  /** IMAP keeps no record of where a message was trashed from; the inbox is the target. */
  async untrash(messageId: string): Promise<void> {
    await this.moveToPath(messageId, "INBOX");
  }

  async setSpam(messageId: string, spam: boolean): Promise<void> {
    if (spam) await this.moveTo(messageId, "\\Junk");
    else await this.moveToPath(messageId, "INBOX");
  }

  async move(messageId: string, destinationId: string): Promise<void> {
    await this.moveToPath(messageId, destinationId);
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

  async setStarred(messageId: string, starred: boolean): Promise<void> {
    const { mailbox, uid } = decodeId(messageId);
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        if (starred) await client.messageFlagsAdd(String(uid), ["\\Flagged"], { uid: true });
        else await client.messageFlagsRemove(String(uid), ["\\Flagged"], { uid: true });
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
    if (add[0]) await this.moveToPath(messageId, add[0]);
  }

  async createLabel(name: string): Promise<Label> {
    return this.withImap(async (client) => {
      const res = await client.mailboxCreate(name);
      return { id: res.path, name, type: "folder" };
    });
  }

  async listDrafts(maxResults = 20): Promise<DraftSummary[]> {
    return this.withImap(async (client) => {
      const draftsPath = await this.specialPath(client, "\\Drafts");
      const lock = await client.getMailboxLock(draftsPath);
      try {
        const uids = (await client.search({ all: true }, { uid: true })) || [];
        if (uids.length === 0) return [];
        const recent = uids.sort((a, b) => b - a).slice(0, maxResults);
        const drafts: DraftSummary[] = [];
        for await (const msg of client.fetch(
          recent.join(","),
          { uid: true, envelope: true },
          { uid: true },
        )) {
          const env = msg.envelope;
          drafts.push({
            id: encodeId(draftsPath, msg.uid),
            account: this.email,
            provider: "icloud",
            to: envelopeAddresses(env?.to),
            cc: envelopeAddresses(env?.cc),
            subject: env?.subject ?? "(no subject)",
            snippet: "",
            updatedAt: env?.date ? new Date(env.date).toISOString() : undefined,
          });
        }
        return drafts.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      } finally {
        lock.release();
      }
    });
  }

  /** IMAP can't edit a stored message, so an update is append-then-delete. */
  async updateDraft(draftId: string, input: SendEmailInput): Promise<{ id: string }> {
    const raw = await this.buildRaw(input);
    const { mailbox, uid } = decodeId(draftId);
    return this.withImap(async (client) => {
      const draftsPath = await this.specialPath(client, "\\Drafts");
      const res = await client.append(draftsPath, raw, ["\\Draft"]);
      if (!res) throw new ProviderApiError("icloud", 502, "Could not save draft");
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageDelete(String(uid), { uid: true });
      } finally {
        lock.release();
      }
      return { id: res.uid ? encodeId(res.destination, res.uid) : "draft" };
    });
  }

  async sendDraft(draftId: string): Promise<{ id: string }> {
    const { mailbox, uid } = decodeId(draftId);
    const draft = await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!msg || !msg.source) {
          throw new ProviderApiError("icloud", 404, `Draft not found: ${draftId}`);
        }
        return { source: msg.source, parsed: await simpleParser(msg.source) };
      } finally {
        lock.release();
      }
    });
    const recipients = [
      ...toAddresses(draft.parsed.to),
      ...toAddresses(draft.parsed.cc),
      ...toAddresses(draft.parsed.bcc),
    ].map((a) => a.email);
    if (recipients.length === 0) {
      throw new ProviderApiError("icloud", 400, `Draft ${draftId} has no recipients.`);
    }
    const sent = await this.smtpSend(draft.source, recipients);
    await this.deleteDraft(draftId).catch(() => undefined);
    return sent;
  }

  async deleteDraft(draftId: string): Promise<void> {
    const { mailbox, uid } = decodeId(draftId);
    await this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        await client.messageDelete(String(uid), { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async listAttachments(messageId: string): Promise<Attachment[]> {
    const { mailbox, uid } = decodeId(messageId);
    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(
          String(uid),
          { uid: true, bodyStructure: true },
          { uid: true },
        );
        if (!msg) throw new ProviderApiError("icloud", 404, `Message not found: ${messageId}`);
        // Drop the `encoding` field the fetcher needs but callers shouldn't see.
        return structureAttachments(msg.bodyStructure).map(({ encoding: _e, ...a }) => a);
      } finally {
        lock.release();
      }
    });
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentContent> {
    const { mailbox, uid } = decodeId(messageId);
    return this.withImap(async (client) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const meta = await client.fetchOne(
          String(uid),
          { uid: true, bodyStructure: true },
          { uid: true },
        );
        const match = structureAttachments(meta ? meta.bodyStructure : undefined).find(
          (a) => a.id === attachmentId,
        );
        if (!match) {
          throw new ProviderApiError(
            "icloud",
            404,
            `No attachment ${attachmentId} on ${messageId}`,
          );
        }
        const res = await client.fetchOne(
          String(uid),
          { uid: true, bodyParts: [{ key: attachmentId }] },
          { uid: true },
        );
        const buf = res && res.bodyParts?.get(attachmentId);
        if (!buf) {
          throw new ProviderApiError("icloud", 502, `Could not read attachment ${attachmentId}`);
        }
        const bytes = decodePartBuffer(buf, match.encoding);
        const { encoding: _e, ...attachment } = match;
        return { ...attachment, size: bytes.length, data: bytes.toString("base64") };
      } finally {
        lock.release();
      }
    });
  }
}
