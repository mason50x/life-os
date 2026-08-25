import { cache } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { listAccounts } from "@/lib/accounts";
import { api, convex, serviceKey } from "@/lib/convex";

/**
 * The dashboard shell and the page inside it both need the session and the
 * account list, and they render in the same request — `cache` collapses that
 * into one call each instead of two round trips per navigation.
 */
export const session = cache(async () => withAuth({ ensureSignedIn: true }));

export const accountsOf = cache(async (userId: string) => listAccounts(userId));

export interface KeyRow {
  _id: string;
  name: string;
  prefix: string;
  createdAt: number;
}

export const keysOf = cache(
  async (userId: string) =>
    convex().query(api.apiKeys.listByUser, {
      serviceKey: serviceKey(),
      userId,
    }) as Promise<KeyRow[]>,
);
