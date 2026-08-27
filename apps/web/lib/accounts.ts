import {
  CalendarProvider,
  Capability,
  ConnectedAccount,
  EmailProvider,
  MAX_ACCOUNT_NICKNAME,
  OAuthProvider,
  Provider,
  calendarOwners,
  createCalendarProvider,
  createProvider,
  refreshAccessToken,
} from "@lifeos/core";
import { api, convex, serviceKey } from "./convex";
import { decryptSecret, encryptSecret } from "./crypto";
import { env } from "./env";

interface AccountDoc {
  _id: string;
  userId: string;
  provider: Provider;
  email: string;
  loginEmail?: string;
  displayName?: string;
  nickname?: string;
  status: "active" | "needs_reauth" | "disconnected";
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  accessTokenExpiresAt: number;
  tokenClient?: "connect" | "authkit";
  capabilities?: Capability[];
  grantedScopes?: string;
  connectedAt: number;
}

/**
 * Rows written before calendar existed carry no capabilities and are mail —
 * which is all they were ever used for. `enableCalendar` upgrades one on
 * demand, once the provider has proved it, so there is nothing to backfill.
 */
function capabilitiesOf(doc: AccountDoc): Capability[] {
  return doc.capabilities?.length ? doc.capabilities : ["email"];
}

/**
 * Credentials for refreshing an account's tokens. Gmail has two OAuth clients:
 * the dedicated connect client, and the separate AuthKit sign-in client behind
 * WorkOS (accounts adopted at sign-in). A refresh token only works against the
 * client that issued it, so the account says which pair to use.
 */
function providerCredentials(provider: OAuthProvider, tokenClient?: AccountDoc["tokenClient"]) {
  if (provider !== "gmail") {
    return { clientId: env("MICROSOFT_CLIENT_ID"), clientSecret: env("MICROSOFT_CLIENT_SECRET") };
  }
  // Falls through to the connect client when no sign-in client is configured,
  // which is correct for deployments where one Google client serves both.
  if (tokenClient === "authkit" && process.env.WORKOS_GOOGLE_CLIENT_SECRET) {
    return {
      clientId: env("WORKOS_GOOGLE_CLIENT_ID"),
      clientSecret: env("WORKOS_GOOGLE_CLIENT_SECRET"),
    };
  }
  return { clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") };
}

async function accountDocs(userId: string): Promise<AccountDoc[]> {
  return (await convex().query(api.accounts.listByUser, {
    serviceKey: serviceKey(),
    userId,
  })) as AccountDoc[];
}

export async function listAccounts(userId: string): Promise<ConnectedAccount[]> {
  const docs = await accountDocs(userId);
  // Addresses sharing one sign-in share one set of calendars — work out which
  // of them speaks for it here, once, so every surface agrees on the answer.
  const owners = calendarOwners(docs);
  return docs.map((d) => ({
    id: d._id,
    userId: d.userId,
    provider: d.provider,
    email: d.email,
    displayName: d.displayName,
    nickname: d.nickname,
    status: d.status,
    capabilities: capabilitiesOf(d),
    ...(owners.has(d.email) ? { calendarOf: owners.get(d.email) } : {}),
    connectedAt: d.connectedAt,
  }));
}

/**
 * The closure that yields an account's live credential — an OAuth access
 * token, refreshed when it's due, or the stored iCloud app-specific password.
 * Every surface is built from this: one account, one credential.
 */
function secretFor(doc: AccountDoc): () => Promise<string> {
  // iCloud authenticates with a stored app-specific password — nothing to
  // refresh. loginEmail (the primary iCloud address) signs in; doc.email is
  // the send-as address for custom-domain/alias accounts.
  if (doc.provider === "icloud") {
    return async () => decryptSecret(doc.accessTokenEnc);
  }
  const oauthProvider: OAuthProvider = doc.provider;

  const getAccessToken = async (): Promise<string> => {
    // Refresh when the cached access token is within 60s of expiry.
    if (doc.accessTokenExpiresAt > Date.now() + 60_000) {
      return decryptSecret(doc.accessTokenEnc);
    }
    if (!doc.refreshTokenEnc) {
      throw new Error(`Account ${doc.email} needs re-authentication (no refresh token).`);
    }
    const creds = providerCredentials(oauthProvider, doc.tokenClient);
    let tokens;
    try {
      tokens = await refreshAccessToken(oauthProvider, {
        ...creds,
        refreshToken: decryptSecret(doc.refreshTokenEnc),
      });
    } catch (e) {
      await convex().mutation(api.accounts.setStatus, {
        serviceKey: serviceKey(),
        id: doc._id,
        status: "needs_reauth",
      });
      throw new Error(
        `Token refresh failed for ${doc.email}; the user must reconnect it in the LifeOS dashboard. (${e})`,
      );
    }
    doc.accessTokenEnc = encryptSecret(tokens.access_token);
    doc.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    await convex().mutation(api.accounts.updateTokens, {
      serviceKey: serviceKey(),
      id: doc._id,
      accessTokenEnc: doc.accessTokenEnc,
      accessTokenExpiresAt: doc.accessTokenExpiresAt,
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
    });
    return tokens.access_token;
  };

  return getAccessToken;
}

/** The account row for one address, with the closure that unlocks it. */
async function credentialsFor(
  userId: string,
  accountEmail: string,
): Promise<{ doc: AccountDoc; getSecret: () => Promise<string> }> {
  const doc = (await convex().query(api.accounts.getByUserEmail, {
    serviceKey: serviceKey(),
    userId,
    email: accountEmail,
  })) as AccountDoc | null;
  if (!doc) {
    throw new Error(
      `No connected account "${accountEmail}". Use list_accounts to see connected accounts.`,
    );
  }
  return { doc, getSecret: secretFor(doc) };
}

export async function getProviderForAccount(
  userId: string,
  accountEmail: string,
): Promise<EmailProvider> {
  const { doc, getSecret } = await credentialsFor(userId, accountEmail);
  if (doc.provider === "icloud") {
    // Lazy: keeps the IMAP stack (imapflow/mailparser/nodemailer) out of the
    // route's cold-start module graph.
    const { IcloudProvider } = await import("@lifeos/core/icloud");
    return new IcloudProvider(doc.email, getSecret, doc.loginEmail ?? doc.email);
  }
  return await createProvider(doc.provider, doc.email, getSecret);
}

export async function getCalendarForAccount(
  userId: string,
  accountEmail: string,
): Promise<CalendarProvider> {
  const { doc, getSecret } = await credentialsFor(userId, accountEmail);
  if (!capabilitiesOf(doc).includes("calendar")) {
    throw new Error(
      `${doc.email} is connected for mail only. The user can add calendar from the LifeOS ` +
        `dashboard — one click on "Enable calendar", which asks the provider with the ` +
        `credential already on file rather than asking them for a new one.`,
    );
  }
  return await createCalendarProvider(doc.provider, doc.email, getSecret, {
    loginEmail: doc.loginEmail,
  });
}

/** Where an account has to go when its stored credential can't reach calendar. */
export interface CalendarReconnect {
  provider: Provider;
  /** The address that signs in — what the iCloud form should start prefilled with. */
  loginEmail: string;
  /** Every address on this one credential, so one reconnect upgrades them all. */
  addresses: string[];
}

export type EnableCalendarResult =
  | { enabled: string[] }
  | { error: string; reconnect?: CalendarReconnect };

/**
 * Turn calendar on for an account that is already connected, without asking
 * anyone for a credential they no longer have.
 *
 * Accounts linked before calendar existed are recorded as mail-only, but the
 * credential sitting in the row often reaches the calendar already — an iCloud
 * app-specific password needs no extra grant to speak CalDAV, and a Google
 * token works whenever the consent screen it came from included the calendar
 * scope. So this proves it
 * the only way that counts, with a real `listCalendars` round trip, and writes
 * the capability down only if that succeeds. When it doesn't, the account is
 * left exactly as it was and the caller is told where reconnecting would fix it.
 */
export async function enableCalendar(
  userId: string,
  id: string,
): Promise<EnableCalendarResult> {
  const docs = await accountDocs(userId);
  // Look the id up among the caller's own accounts rather than trusting it —
  // the same thing that scopes /check to the signed-in user.
  const doc = docs.find((d) => d._id === id);
  if (!doc) return { error: "No such connected account." };
  if (capabilitiesOf(doc).includes("calendar")) return { enabled: [] };
  if (doc.provider === "outlook") {
    return { error: "LifeOS doesn't do Outlook calendars yet — only Google and Apple." };
  }

  const signIn = doc.loginEmail ?? doc.email;
  const reconnect: CalendarReconnect = {
    provider: doc.provider,
    loginEmail: signIn,
    addresses: docs
      .filter((d) => d.provider === doc.provider && (d.loginEmail ?? d.email) === signIn)
      .map((d) => d.email),
  };

  try {
    const calendar = await createCalendarProvider(doc.provider, doc.email, secretFor(doc), {
      loginEmail: doc.loginEmail,
    });
    await calendar.listCalendars();
  } catch (e) {
    console.warn(`Calendar out of reach for ${doc.email}:`, e);
    return {
      error:
        doc.provider === "icloud"
          ? "iCloud wouldn't open the calendar with the password on file — it may have been " +
            "revoked. Reconnecting with a fresh app-specific password fixes both surfaces at once."
          : "This Google account was connected before calendar, without the calendar " +
            "permission. Reconnecting adds it — the same consent screen, one more tick.",
      reconnect,
    };
  }

  const enabled = (await convex().mutation(api.accounts.grantCapability, {
    serviceKey: serviceKey(),
    userId,
    id,
    capability: "calendar",
  })) as string[];
  return { enabled };
}

/**
 * Give an account a friendly name, or hand it back its default by passing
 * nothing (or only whitespace). Returns the account's address so a caller that
 * only had an id can say what it just renamed.
 */
export async function renameAccount(
  userId: string,
  id: string,
  nickname: string | undefined,
): Promise<string> {
  const trimmed = nickname?.trim().replace(/\s+/g, " ");
  if (trimmed && trimmed.length > MAX_ACCOUNT_NICKNAME) {
    throw new Error(`Names are at most ${MAX_ACCOUNT_NICKNAME} characters.`);
  }
  const email = (await convex().mutation(api.accounts.rename, {
    serviceKey: serviceKey(),
    id,
    userId,
    ...(trimmed ? { nickname: trimmed } : {}),
  })) as string | null;
  if (!email) throw new Error("No such connected account.");
  return email;
}

export async function removeAccount(userId: string, id: string): Promise<void> {
  await convex().mutation(api.accounts.remove, { serviceKey: serviceKey(), id, userId });
}

export interface AccountCheck {
  ok: boolean;
  /** Round trip in ms, so a slow provider is visible and not just a pass. */
  ms: number;
  detail: string;
}

/**
 * Prove an account still works end to end: refresh its token if due, then make
 * the cheapest real API call the provider interface offers. This is what turns
 * a stored `status: "active"` into something actually verified — a revoked
 * grant looks fine in the database until someone calls the provider.
 */
export async function checkAccount(userId: string, email: string): Promise<AccountCheck> {
  const started = Date.now();
  try {
    const provider = await getProviderForAccount(userId, email);
    const labels = await provider.listLabels();
    const detail = [`${labels.length} folders reachable`];

    // Calendar is a separate grant on the same credential, so it can fail on
    // its own — a check that only proved mail would call that account healthy.
    // An address whose calendar lives on a sibling is checked when that sibling
    // is, rather than probing one Apple sign-in once per alias.
    const account = (await listAccounts(userId)).find((a) => a.email === email);
    if (account?.calendarOf) {
      detail.push(`calendar via ${account.calendarOf}`);
    } else if (account?.capabilities.includes("calendar")) {
      const calendars = await (await getCalendarForAccount(userId, email)).listCalendars();
      detail.push(`${calendars.length} calendars reachable`);
    }
    return { ok: true, ms: Date.now() - started, detail: detail.join(", ") };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: e instanceof Error ? e.message : String(e) };
  }
}
