import { cliError, cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { signHandoff } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

/** Long enough to sign in and get through a provider's consent screen. */
const HANDOFF_TTL_MS = 10 * 60 * 1000;

/**
 * Mint the URL the CLI opens to connect a mailbox. Google and Microsoft consent
 * has to happen in a browser, and startConnect needs an AuthKit cookie session
 * the CLI doesn't have — so the CLI hands the browser a signed note saying which
 * user asked, and /cli/connect checks it against whoever is actually signed in.
 */
export async function POST(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();

  const body = (await req.json().catch(() => null)) as { provider?: string } | null;
  const provider = body?.provider;
  if (provider !== "gmail" && provider !== "outlook") {
    return cliError('provider must be "gmail" or "outlook" (iCloud connects without a browser).');
  }

  const token = signHandoff({ userId, provider, expiresAt: Date.now() + HANDOFF_TTL_MS });
  return Response.json({
    url: `${appUrl()}/cli/connect?t=${encodeURIComponent(token)}`,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  });
}
