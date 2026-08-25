import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  OAuthProvider,
  exchangeCode,
  fetchProfile,
  googleAuthUrl,
  microsoftAuthUrl,
} from "@lifeos/core";
import { api, convex, serviceKey } from "./convex";
import { encryptSecret } from "./crypto";
import { appUrl, env } from "./env";

const STATE_COOKIE = "lifeos_oauth_state";

function redirectUri(provider: OAuthProvider): string {
  return `${appUrl()}/api/connect/${provider === "gmail" ? "google" : "microsoft"}/callback`;
}

export async function startConnect(provider: OAuthProvider): Promise<NextResponse> {
  const { user } = await withAuth({ ensureSignedIn: true });
  const state = `${user.id}.${randomBytes(16).toString("hex")}`;
  const url =
    provider === "gmail"
      ? googleAuthUrl(env("GOOGLE_CLIENT_ID"), redirectUri(provider), state)
      : microsoftAuthUrl(env("MICROSOFT_CLIENT_ID"), redirectUri(provider), state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: appUrl().startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return res;
}

export async function finishConnect(provider: OAuthProvider, req: Request): Promise<NextResponse> {
  const { user } = await withAuth({ ensureSignedIn: true });
  const url = new URL(req.url);
  const dashboard = (params: string) => NextResponse.redirect(`${appUrl()}/dashboard?${params}`);

  const error = url.searchParams.get("error");
  if (error) return dashboard(`error=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value;
  if (!code || !state || state !== cookieState || !state.startsWith(`${user.id}.`)) {
    return dashboard("error=invalid_oauth_state");
  }

  try {
    const creds =
      provider === "gmail"
        ? { clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") }
        : { clientId: env("MICROSOFT_CLIENT_ID"), clientSecret: env("MICROSOFT_CLIENT_SECRET") };
    const tokens = await exchangeCode(provider, {
      ...creds,
      code,
      redirectUri: redirectUri(provider),
    });
    const profile = await fetchProfile(provider, tokens.access_token);

    await convex().mutation(api.accounts.upsert, {
      serviceKey: serviceKey(),
      userId: user.id,
      provider,
      email: profile.email,
      displayName: profile.name,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      tokenClient: "connect",
    });

    const res = dashboard(`connected=${encodeURIComponent(profile.email)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    console.error(`OAuth connect failed (${provider}):`, e);
    return dashboard("error=connect_failed");
  }
}

/**
 * The scope that makes a sign-in token usable as a connected mailbox. AuthKit
 * requests it only when the WorkOS Google provider is configured with it as a
 * custom scope; without it the returned token is identity-only and useless here.
 */
const GMAIL_SCOPE = "https://mail.google.com/";

/**
 * The provider tokens WorkOS hands back from an AuthKit sign-in — minted by the
 * sign-in OAuth client, which is a different Google client from the one the
 * connect flow uses. Declared
 * structurally rather than imported: `@workos-inc/node` reaches us only as a
 * transitive dependency of authkit-nextjs.
 */
interface SignInOauthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp; WorkOS sends seconds, but tolerate milliseconds. */
  expiresAt: number;
  scopes: string[];
}

/**
 * Adopt the Google account someone signed in with as a connected mailbox, so a
 * new user lands on the dashboard with their inbox already there.
 *
 * WorkOS surfaces Google's own tokens exactly once — in the authenticate-with-code
 * response, i.e. this callback. There is no API to fetch them later (the
 * Identities endpoint carries no credentials), so whatever we do not persist
 * here is gone until the user signs in again.
 *
 * Never throws: sign-in must succeed even when adoption cannot.
 */
export async function connectFromSignIn(
  userId: string,
  tokens: SignInOauthTokens | undefined,
): Promise<void> {
  // No tokens at all means the provider isn't configured to return them, or the
  // user signed in by some route other than Google — not worth a word.
  if (!tokens?.accessToken) return;

  // Tokens that arrived but can't be used are worth saying out loud: a missing
  // refresh token means Google skipped consent (it only mints one on a new or
  // changed grant), and an hour-long access token with no way to renew is not
  // an account. Either way the user falls back to the normal connect flow.
  if (!tokens.refreshToken || !tokens.scopes?.includes(GMAIL_SCOPE)) {
    console.warn(
      `Sign-in tokens not adoptable — refreshToken: ${Boolean(tokens.refreshToken)}, scopes: ${tokens.scopes?.join(" ") ?? "none"}`,
    );
    return;
  }

  try {
    const profile = await fetchProfile("gmail", tokens.accessToken);
    await convex().mutation(api.accounts.upsert, {
      serviceKey: serviceKey(),
      userId,
      provider: "gmail",
      email: profile.email,
      displayName: profile.name,
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      accessTokenExpiresAt: expiresAtMs(tokens.expiresAt),
      // Minted by the AuthKit sign-in client, not the connect client — refreshes
      // must go back to the same one.
      tokenClient: "authkit",
    });
  } catch (e) {
    // A failed adoption is recoverable — the user can still connect by hand.
    console.error("Auto-connect from sign-in failed:", e);
  }
}

/** Normalize a unix timestamp to milliseconds, whichever unit WorkOS sent. */
function expiresAtMs(expiresAt: number): number {
  return expiresAt > 1e11 ? expiresAt : expiresAt * 1000;
}
