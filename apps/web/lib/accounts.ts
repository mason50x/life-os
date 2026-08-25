import {
  ConnectedAccount,
  EmailProvider,
  OAuthProvider,
  Provider,
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
  status: "active" | "needs_reauth" | "disconnected";
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  accessTokenExpiresAt: number;
  tokenClient?: "connect" | "authkit";
  connectedAt: number;
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

export async function listAccounts(userId: string): Promise<ConnectedAccount[]> {
  const docs = (await convex().query(api.accounts.listByUser, {
    serviceKey: serviceKey(),
    userId,
  })) as AccountDoc[];
  return docs.map((d) => ({
    id: d._id,
    userId: d.userId,
    provider: d.provider,
    email: d.email,
    displayName: d.displayName,
    status: d.status,
    connectedAt: d.connectedAt,
  }));
}

export async function getProviderForAccount(
  userId: string,
  accountEmail: string,
): Promise<EmailProvider> {
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

  // iCloud authenticates with a stored app-specific password — nothing to
  // refresh. loginEmail (the primary iCloud address) signs in; doc.email is
  // the send-as address for custom-domain/alias accounts.
  if (doc.provider === "icloud") {
    // Lazy: keeps the IMAP stack (imapflow/mailparser/nodemailer) out of the
    // route's cold-start module graph.
    const { IcloudProvider } = await import("@lifeos/core/icloud");
    return new IcloudProvider(
      doc.email,
      async () => decryptSecret(doc.accessTokenEnc),
      doc.loginEmail ?? doc.email,
    );
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

  return await createProvider(doc.provider, doc.email, getAccessToken);
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
    return { ok: true, ms: Date.now() - started, detail: `${labels.length} folders reachable` };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: e instanceof Error ? e.message : String(e) };
  }
}
