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
  connectedAt: number;
}

function providerCredentials(provider: OAuthProvider) {
  return provider === "gmail"
    ? { clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") }
    : { clientId: env("MICROSOFT_CLIENT_ID"), clientSecret: env("MICROSOFT_CLIENT_SECRET") };
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
    const creds = providerCredentials(oauthProvider);
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
