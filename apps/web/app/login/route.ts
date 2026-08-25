import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

/**
 * `?signup` routes through AuthKit's sign-up screen with `prompt=consent`.
 * Google only mints a refresh token on a new or re-consented grant — without
 * it, a Gmail sign-in yields an hour-long access token we can't renew, and the
 * inbox can't be adopted as a connected account (see `connectFromSignIn`).
 * Plain sign-in stays on the default prompt so returning users aren't asked to
 * re-approve on every visit.
 */
export const GET = async (req: Request) => {
  const signUp = new URL(req.url).searchParams.has("signup");
  redirect(signUp ? await getSignUpUrl({ prompt: "consent" }) : await getSignInUrl());
};
