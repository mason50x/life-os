import type { EmailAddress, Message } from "@lifeos/core";

const QUOTE_CHARS = 2000;

function dedupe(addresses: EmailAddress[], exclude: string[]): string[] {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  const out: string[] = [];
  for (const a of addresses) {
    const key = a.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a.email);
  }
  return out;
}

export interface ReplyRecipients {
  to: string[];
  cc: string[];
}

/**
 * Reply-To wins over From when it's set — mailing lists and ticketing systems
 * rely on it. Replying to your own sent message goes back to its recipients
 * rather than to yourself, which is what "reply" means on a message you sent.
 */
export function replyRecipients(
  msg: Message,
  self: string,
  replyAll: boolean,
): ReplyRecipients {
  const sentByUser = msg.from?.email?.toLowerCase() === self.toLowerCase();
  const primary = msg.replyTo?.length
    ? msg.replyTo
    : sentByUser
      ? msg.to
      : msg.from
        ? [msg.from]
        : msg.to;
  // The account's own address never belongs in its own reply, whichever side
  // of the original it appeared on.
  const to = dedupe(primary, [self]);
  if (!replyAll) return { to, cc: [] };
  const cc = dedupe([...(msg.to ?? []), ...(msg.cc ?? [])], [self, ...to]);
  return { to, cc };
}

export function replySubject(subject: string | undefined): string {
  const base = subject?.trim() || "(no subject)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

export function forwardSubject(subject: string | undefined): string {
  const base = subject?.trim() || "(no subject)";
  return /^(fwd|fw):/i.test(base) ? base : `Fwd: ${base}`;
}

function addressLine(a: EmailAddress | undefined): string {
  if (!a) return "someone";
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/** The `> ` quoting every mail client produces, so the reply reads normally. */
export function quoteForReply(msg: Message): string {
  const when = msg.date ? `On ${msg.date}, ` : "";
  const body = (msg.body ?? "").slice(0, QUOTE_CHARS);
  const quoted = body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${when}${addressLine(msg.from)} wrote:\n${quoted}`;
}

/** Forwards keep the original headers visible, the way a mail client shows them. */
export function quoteForForward(msg: Message): string {
  const header = [
    "---------- Forwarded message ----------",
    `From: ${addressLine(msg.from)}`,
    ...(msg.date ? [`Date: ${msg.date}`] : []),
    `Subject: ${msg.subject ?? "(no subject)"}`,
    `To: ${(msg.to ?? []).map(addressLine).join(", ") || "(none)"}`,
    ...(msg.cc?.length ? [`Cc: ${msg.cc.map(addressLine).join(", ")}`] : []),
  ].join("\n");
  return `${header}\n\n${msg.body ?? ""}`;
}

export function composeBody(written: string, quoted: string | undefined): string {
  return quoted ? `${written.replace(/\s+$/, "")}\n\n${quoted}` : written;
}
