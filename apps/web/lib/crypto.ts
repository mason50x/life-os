import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

// AES-256-GCM for OAuth tokens at rest. LIFEOS_ENCRYPTION_KEY is 32 bytes, base64.
function key(): Buffer {
  const k = Buffer.from(env("LIFEOS_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new Error("LIFEOS_ENCRYPTION_KEY must be 32 bytes of base64");
  return k;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateApiKey(): string {
  return `lifeos_${randomBytes(24).toString("hex")}`;
}

/**
 * Short-lived signed handoff for the CLI's browser round trip. The CLI has no
 * AuthKit cookie, so it can't start an OAuth connect itself; it opens a URL
 * carrying one of these instead. Binding the WorkOS user id into the signature
 * is what stops an inbox being connected to the wrong LifeOS account when the
 * browser happens to be signed in as somebody else.
 *
 * Keyed off LIFEOS_ENCRYPTION_KEY rather than a new secret — it is already
 * required, already 32 bytes, and already deployment-scoped.
 */
interface Handoff {
  userId: string;
  provider: string;
  /** Unix ms. */
  expiresAt: number;
}

const b64url = (b: Buffer) => b.toString("base64url");

function handoffSignature(body: string): Buffer {
  return createHmac("sha256", key()).update(body).digest();
}

export function signHandoff(payload: Handoff): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString("hex") })));
  return `${body}.${b64url(handoffSignature(body))}`;
}

export function verifyHandoff(token: string): Handoff | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = handoffSignature(body);
  const got = Buffer.from(signature, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Handoff;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
