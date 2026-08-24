"use server";

import { revalidatePath } from "next/cache";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { api, convex, serviceKey } from "@/lib/convex";
import { generateApiKey, sha256Hex } from "@/lib/crypto";

export async function disconnectAccount(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await convex().mutation(api.accounts.remove, {
    serviceKey: serviceKey(),
    id,
    userId: user.id,
  });
  revalidatePath("/dashboard");
}

export async function createApiKey(name: string): Promise<{ key: string }> {
  const { user } = await withAuth({ ensureSignedIn: true });
  const key = generateApiKey();
  await convex().mutation(api.apiKeys.create, {
    serviceKey: serviceKey(),
    userId: user.id,
    name: name.trim() || "CLI key",
    prefix: key.slice(0, 14),
    hash: sha256Hex(key),
  });
  revalidatePath("/dashboard");
  return { key };
}

export async function deleteApiKey(id: string): Promise<void> {
  const { user } = await withAuth({ ensureSignedIn: true });
  await convex().mutation(api.apiKeys.remove, {
    serviceKey: serviceKey(),
    id,
    userId: user.id,
  });
  revalidatePath("/dashboard");
}
