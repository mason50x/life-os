"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { connectHref } from "@/components/dashboard/ProviderMark";
import { enableCalendar, removeAccount, renameAccount } from "@/lib/accounts";
import { mintApiKey, revokeApiKey } from "@/lib/apiKeys";

export async function disconnectAccount(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await removeAccount(user.id, id);
  revalidatePath("/dashboard");
}

/**
 * Rename a connected account. An empty name is not a validation error — it's
 * how someone puts an account back on its default name.
 */
export async function renameAccountAction(id: string, name: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await renameAccount(user.id, id, name);
  revalidatePath("/dashboard");
}

/**
 * Add calendar to an account that was connected for mail. Nearly always this
 * is one click and no typing: the credential already in the row is asked to
 * list calendars, and if it can, the account keeps it. Only a credential that
 * genuinely can't reach the calendar sends anyone back to a connect flow — and
 * then to one that starts prefilled, so nothing has to be typed twice.
 */
export async function enableCalendarAction(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  const result = await enableCalendar(user.id, id);
  revalidatePath("/dashboard");

  if ("enabled" in result) {
    // An empty list means it already had calendar — say so rather than
    // claiming to have enabled nothing.
    redirect(
      result.enabled.length
        ? `/dashboard?calendar=${encodeURIComponent(result.enabled.join(", "))}`
        : "/dashboard",
    );
  }
  if (!result.reconnect) {
    redirect(`/dashboard?error=${encodeURIComponent(result.error)}`);
  }
  if (result.reconnect.provider === "icloud") {
    // Prefilled with the sign-in address and every send-as address on it, so
    // one new password upgrades the whole mailbox instead of one row of it.
    const params = new URLSearchParams({
      reason: "calendar",
      email: result.reconnect.loginEmail,
      addresses: result.reconnect.addresses.join(", "),
    });
    redirect(`/connect/icloud?${params}`);
  }
  // Google's calendar permission only comes from Google's consent screen.
  redirect(connectHref(result.reconnect.provider));
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
