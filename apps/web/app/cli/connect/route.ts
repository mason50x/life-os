import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { CLI_CONNECT_COOKIE, startConnect } from "@/lib/connect";
import { verifyHandoff } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

/**
 * The browser half of `lifeos accounts add`. Requires a signed-in AuthKit
 * session like any other connect entry point, then checks that the session
 * belongs to the same user the CLI signed in as before starting OAuth —
 * otherwise a mailbox would silently land in whichever account the browser
 * happened to be signed into.
 */
export async function GET(req: Request) {
  const { user } = await withAuth({ ensureSignedIn: true });

  const handoff = verifyHandoff(new URL(req.url).searchParams.get("t") ?? "");
  if (!handoff) {
    return NextResponse.redirect(`${appUrl()}/cli/done?error=expired`);
  }
  if (handoff.userId !== user.id) {
    return NextResponse.redirect(`${appUrl()}/cli/done?error=wrong_account`);
  }

  const res = await startConnect(handoff.provider === "gmail" ? "gmail" : "outlook");
  // Read back by finishConnect so the provider callback returns here instead of
  // dropping the user on the dashboard mid-CLI-flow.
  res.cookies.set(CLI_CONNECT_COOKIE, "1", {
    httpOnly: true,
    secure: appUrl().startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return res;
}
