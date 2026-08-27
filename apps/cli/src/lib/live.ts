import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import { currentCredential, fetchInstanceConfig } from "./auth.js";
import type { Account, ApiKey } from "./types.js";

/**
 * Live subscriptions to the instance's Convex deployment — the same queries
 * the dashboard subscribes to, over the same WebSocket protocol, so an account
 * connected in the browser appears in the terminal as it happens.
 *
 * Reads only. Everything that needs the Next.js process — encrypting tokens,
 * OAuth secrets, IMAP/CalDAV probes, minting keys — stays on /api/cli/v1.
 */
export interface LiveClient {
  /** Runs immediately with the current list, then on every change. */
  onAccounts(cb: (accounts: Account[]) => void): () => void;
  onKeys(cb: (keys: ApiKey[]) => void): () => void;
  close(): Promise<void>;
}

/**
 * Open a live connection, or say why there isn't one. Null when this process
 * can't subscribe: signed in with an API key (`lifeos_…` is not a JWT Convex
 * can verify), a server that predates `convexUrl` in its config, or a Node
 * without a global WebSocket (before 22). Callers keep the HTTP snapshot they
 * already have — live is an upgrade, never a requirement.
 */
export async function connectLive(apiUrl: string): Promise<LiveClient | null> {
  if (typeof WebSocket === "undefined") return null;

  const credential = await currentCredential(apiUrl).catch(() => null);
  if (credential?.kind !== "session") return null;

  let convexUrl: string | null | undefined;
  try {
    ({ convexUrl } = await fetchInstanceConfig(apiUrl));
  } catch {
    return null;
  }
  if (!convexUrl) return null;

  const client = new ConvexClient(convexUrl);
  // Convex re-invokes this when the token it holds expires, and
  // currentCredential refreshes through WorkOS whenever the stored one is
  // stale — so the subscription outlives any single access token.
  client.setAuth(async () => {
    const current = await currentCredential(apiUrl).catch(() => null);
    return current?.kind === "session" ? current.token : null;
  });

  const subscribe = <T>(name: "accounts" | "apiKeys", cb: (rows: T[]) => void) =>
    client.onUpdate(
      anyApi[name]!.mine!,
      {} as Record<string, never>,
      // Null means the token didn't authenticate (yet); keep what's shown.
      (rows) => {
        if (rows) cb(rows as T[]);
      },
      // Swallowed: the HTTP path still works, and a dead subscription should
      // degrade to exactly the CLI this was before it existed.
      () => {},
    );

  return {
    onAccounts: (cb) => subscribe<Account>("accounts", cb),
    onKeys: (cb) => subscribe<ApiKey>("apiKeys", cb),
    close: () => client.close(),
  };
}
