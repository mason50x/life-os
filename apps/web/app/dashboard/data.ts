import { cache } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { listAccounts } from "@/lib/accounts";
import { KeyRow, listApiKeys } from "@/lib/apiKeys";

/**
 * The dashboard shell and the page inside it both need the session and the
 * account list, and they render in the same request — `cache` collapses that
 * into one call each instead of two round trips per navigation.
 */
export const session = cache(async () => withAuth({ ensureSignedIn: true }));

export const accountsOf = cache(async (userId: string) => listAccounts(userId));

export type { KeyRow };

export const keysOf = cache(async (userId: string) => listApiKeys(userId));
