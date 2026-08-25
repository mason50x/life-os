"use server";

import { revalidatePath } from "next/cache";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { removeAccount } from "@/lib/accounts";
import { mintApiKey, revokeApiKey } from "@/lib/apiKeys";

export async function disconnectAccount(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await removeAccount(user.id, id);
  revalidatePath("/dashboard");
}

export async function createApiKey(name: string): Promise<{ key: string }> {
  const { user } = await withAuth({ ensureSignedIn: true });
  const key = await mintApiKey(user.id, name);
  revalidatePath("/dashboard");
  return key;
}

export async function deleteApiKey(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await revokeApiKey(user.id, id);
  revalidatePath("/dashboard");
}

/**
 * Sign-out as an action rather than a `/logout` link: Next.js prefetches
 * links, and a prefetched GET would destroy the session while the dashboard
 * was still rendering.
 */
export async function signOutAction(): Promise<void> {
  const { signOut } = await import("@workos-inc/authkit-nextjs");
  await signOut({ returnTo: "/" });
}
