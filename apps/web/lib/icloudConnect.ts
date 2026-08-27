import { Capability, ProviderApiError } from "@lifeos/core";
import { api, convex, serviceKey } from "./convex";
import { encryptSecret } from "./crypto";

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Apple's app-specific passwords are always four lowercase quads. */
export const APP_PASSWORD_PATTERN = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;

export interface ICloudConnectInput {
  email: string;
  password: string;
  /** Optional custom-domain / alias send-as addresses living in the same mailbox. */
  sendAs?: string[];
}

export type ICloudConnectResult = { error: string } | { addresses: string[] };

/** Split a free-text list of addresses (comma, space, semicolon or newline separated). */
export function parseAddresses(raw: string): string[] {
  return [...new Set(raw.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
}

/**
 * Verify an iCloud app-specific password against Apple, then store one
 * connected account per send-as address. Shared by the web form and the CLI so
 * both validate identically and neither can persist an unusable credential.
 */
export async function connectIcloudAccount(
  userId: string,
  input: ICloudConnectInput,
): Promise<ICloudConnectResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim().toLowerCase();
  const sendAs = input.sendAs ?? [];

  if (!VALID_EMAIL.test(email)) {
    return { error: "Enter your primary iCloud Mail email address." };
  }
  const badAddress = sendAs.find((a) => !VALID_EMAIL.test(a));
  if (badAddress) {
    return { error: `"${badAddress}" doesn't look like an email address.` };
  }
  if (!APP_PASSWORD_PATTERN.test(password)) {
    return {
      error:
        "That doesn't look like an app-specific password — it has the form xxxx-xxxx-xxxx-xxxx. (It's not your Apple Account password.)",
    };
  }

  try {
    // Live IMAP login against Apple before storing anything. Lazy import keeps
    // the IMAP stack out of every other route's cold start.
    const { IcloudProvider } = await import("@lifeos/core/icloud");
    await IcloudProvider.verify(email, password);
  } catch (e) {
    if (e instanceof ProviderApiError && e.status === 401) {
      return {
        error:
          "iCloud rejected the sign-in. Double-check the email address and the app-specific password — it may have been revoked, or the address may not be your primary iCloud Mail address.",
      };
    }
    console.error("iCloud verification failed:", e);
    return { error: "Couldn't reach iCloud Mail to verify. Try again in a moment." };
  }

  // The same app-specific password reaches iCloud Calendar over CalDAV, so
  // there is nothing more to ask the user for — only something to confirm.
  // A calendar that won't answer must never cost them their mail connection.
  const capabilities: Capability[] = ["email"];
  try {
    const { IcloudCalendarProvider } = await import("@lifeos/core/icloud-calendar");
    await IcloudCalendarProvider.verify(email, password);
    capabilities.push("calendar");
  } catch (e) {
    console.warn(`iCloud connected for mail but not calendar (${email}):`, e);
  }

  // One connected account per address: the primary (unless the user only
  // listed custom addresses) plus each send-as address, all sharing the same
  // credential and mailbox.
  const addresses = sendAs.length > 0 ? sendAs : [email];
  for (const address of addresses) {
    await convex().mutation(api.accounts.upsert, {
      serviceKey: serviceKey(),
      userId,
      provider: "icloud",
      email: address,
      ...(address !== email ? { loginEmail: email } : {}),
      accessTokenEnc: encryptSecret(password),
      // App-specific passwords don't expire, so there is no refresh flow.
      accessTokenExpiresAt: Number.MAX_SAFE_INTEGER,
      capabilities,
    });
  }
  return { addresses };
}
