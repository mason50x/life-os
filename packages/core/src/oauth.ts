import { Provider } from "./types";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export const GOOGLE_SCOPES = [
  // Full Gmail access: read, search, send, drafts, labels, archive, trash, delete
  "https://mail.google.com/",
  // Filters, vacation responder, and other mailbox settings
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "openid",
  "email",
  "profile",
].join(" ");

export const MICROSOFT_SCOPES = [
  "offline_access",
  "User.Read",
  // Full mailbox read/write (messages, folders, drafts, inbox rules) + send
  "Mail.ReadWrite",
  "Mail.Send",
  // Auto-replies, categories, mailbox settings
  "MailboxSettings.ReadWrite",
].join(" ");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function microsoftAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: MICROSOFT_SCOPES,
    prompt: "select_account",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

async function tokenRequest(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(
  provider: Provider,
  opts: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<TokenResponse> {
  return tokenRequest(provider === "gmail" ? GOOGLE_TOKEN_URL : MICROSOFT_TOKEN_URL, {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(
  provider: Provider,
  opts: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<TokenResponse> {
  return tokenRequest(provider === "gmail" ? GOOGLE_TOKEN_URL : MICROSOFT_TOKEN_URL, {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: "refresh_token",
    ...(provider === "outlook" ? { scope: MICROSOFT_SCOPES } : {}),
  });
}

/** Fetch the authenticated user's email address for a freshly connected account. */
export async function fetchProfile(
  provider: Provider,
  accessToken: string,
): Promise<{ email: string; name?: string }> {
  if (provider === "gmail") {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch Google profile: ${res.status}`);
    const data = (await res.json()) as { email: string; name?: string };
    return { email: data.email, name: data.name };
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Microsoft profile: ${res.status}`);
  const data = (await res.json()) as {
    mail?: string;
    userPrincipalName: string;
    displayName?: string;
  };
  return { email: data.mail ?? data.userPrincipalName, name: data.displayName };
}
