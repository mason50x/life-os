import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  Provider,
  exchangeCode,
  fetchProfile,
  googleAuthUrl,
  microsoftAuthUrl,
} from "@lifeos/core";
import { api, convex, serviceKey } from "./convex";
import { encryptSecret } from "./crypto";
import { appUrl, env } from "./env";

const STATE_COOKIE = "lifeos_oauth_state";

function redirectUri(provider: Provider): string {
  return `${appUrl()}/api/connect/${provider === "gmail" ? "google" : "microsoft"}/callback`;
}

export async function startConnect(provider: Provider): Promise<NextResponse> {
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

export async function finishConnect(provider: Provider, req: Request): Promise<NextResponse> {
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
    });

    const res = dashboard(`connected=${encodeURIComponent(profile.email)}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    console.error(`OAuth connect failed (${provider}):`, e);
    return dashboard("error=connect_failed");
  }
}
