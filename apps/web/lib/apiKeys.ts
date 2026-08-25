import { api, convex, serviceKey } from "./convex";
import { generateApiKey, sha256Hex } from "./crypto";

export interface KeyRow {
  _id: string;
  name: string;
  /** Leading characters kept for display; the key itself is only ever stored hashed. */
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

/** Characters of the key shown in the UI. `lifeos_` plus seven of the hex. */
const PREFIX_LENGTH = 14;

/**
 * Mint an API key. The raw value is returned to the caller once and never
 * stored — only its SHA-256 and display prefix reach the database.
 */
export async function mintApiKey(userId: string, name: string): Promise<{ key: string }> {
  const key = generateApiKey();
  await convex().mutation(api.apiKeys.create, {
    serviceKey: serviceKey(),
    userId,
    name: name.trim() || "CLI key",
    prefix: key.slice(0, PREFIX_LENGTH),
    hash: sha256Hex(key),
  });
  return { key };
}

export async function listApiKeys(userId: string): Promise<KeyRow[]> {
  return (await convex().query(api.apiKeys.listByUser, {
    serviceKey: serviceKey(),
    userId,
  })) as KeyRow[];
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  await convex().mutation(api.apiKeys.remove, { serviceKey: serviceKey(), id, userId });
}
