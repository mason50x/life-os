import { Capability, OAuthProvider } from "./types";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Full Gmail access: read, search, send, drafts, labels, archive, trash, delete. */
export const GOOGLE_MAIL_SCOPE = "https://mail.google.com/";

/**
 * Read, write, share and delete on every calendar the user can reach. The
 * narrower calendar.events scope can't list calendars, which every write tool
 * needs first, so there is no useful middle ground.
 */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export const GOOGLE_SCOPES = [
  GOOGLE_MAIL_SCOPE,
  // Filters, vacation responder, and other mailbox settings
  "https://www.googleapis.com/auth/gmail.settings.basic",
  GOOGLE_CALENDAR_SCOPE,
  "openid",
  "email",
  "profile",
].join(" ");

/**
 * What a grant actually permits, read from the scopes Google returned rather
 * than the ones we asked for — a user can untick calendar on the consent
 * screen, and an account linked before calendar existed has a mail-only
 * refresh token until it is reconnected.
 */
export function capabilitiesFromScopes(scope: string | string[] | undefined): Capability[] {
  const granted = new Set(
    (Array.isArray(scope) ? scope : (scope ?? "").split(" ")).filter(Boolean),
  );
  const capabilities: Capability[] = [];
  if (granted.has(GOOGLE_MAIL_SCOPE)) capabilities.push("email");
  if (granted.has(GOOGLE_CALENDAR_SCOPE)) capabilities.push("calendar");
  return capabilities;
}

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
    // Additive re-consent: someone who linked their inbox before calendar
    // existed keeps the mail grant they already gave rather than trading it in.
    include_granted_scopes: "true",
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
  provider: OAuthProvider,
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
  provider: OAuthProvider,
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
  provider: OAuthProvider,
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
