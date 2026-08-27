import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  Capability,
  OAuthProvider,
  capabilitiesFromScopes,
  exchangeCode,
  fetchProfile,
  googleAuthUrl,
  microsoftAuthUrl,
} from "@lifeos/core";
import { api, convex, serviceKey } from "./convex";
import { encryptSecret } from "./crypto";
import { appUrl, env } from "./env";

const STATE_COOKIE = "lifeos_oauth_state";
/**
 * Set by /cli/connect. Its only job is to tell finishConnect that a terminal is
 * waiting on the other side, so the callback lands on /cli/done rather than the
 * dashboard. The dashboard's own connect flow never sets it.
 */
export const CLI_CONNECT_COOKIE = "lifeos_cli_connect";

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
  const jar = await cookies();
  const fromCli = jar.get(CLI_CONNECT_COOKIE)?.value === "1";

  const done = (params: string) => {
    const res = NextResponse.redirect(`${appUrl()}/${fromCli ? "cli/done" : "dashboard"}?${params}`);
    if (fromCli) res.cookies.delete(CLI_CONNECT_COOKIE);
    return res;
  };

  const error = url.searchParams.get("error");
  if (error) return done(`error=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = jar.get(STATE_COOKIE)?.value;
  if (!code || !state || state !== cookieState || !state.startsWith(`${user.id}.`)) {
    return done("error=invalid_oauth_state");
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
      ...grantedCapabilities(provider, tokens.scope),
    });

    const res = done(`connected=${encodeURIComponent(profile.email)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    console.error(`OAuth connect failed (${provider}):`, e);
    return done("error=connect_failed");
  }
}

/**
 * What to record the account as being good for. Google says so in the scopes
 * it returns; Microsoft has no calendar support here yet, so an Outlook grant
 * is mail and nothing else. A Google response with no scope field at all tells
 * us nothing, and stores nothing rather than guessing a capability away.
 */
function grantedCapabilities(
  provider: OAuthProvider,
  scope: string | undefined,
): { capabilities?: Capability[]; grantedScopes?: string } {
  if (provider !== "gmail") return { capabilities: ["email"] };
  if (!scope) return {};
  const capabilities = capabilitiesFromScopes(scope);
  return capabilities.length ? { capabilities, grantedScopes: scope } : { grantedScopes: scope };
}

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
  //
  // Calendar rides along whenever the WorkOS Google provider carries that
  // custom scope too; mail is what decides whether the account is adoptable.
  const capabilities = capabilitiesFromScopes(tokens.scopes);
  if (!tokens.refreshToken || !capabilities.includes("email")) {
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
      capabilities,
      grantedScopes: tokens.scopes.join(" "),
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
