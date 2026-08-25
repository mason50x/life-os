import { api, convex, serviceKey } from "./convex";
import { sha256Hex } from "./crypto";

/** How stale lastUsedAt may get before it's worth a write. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Resolve the acting user for CLI-facing API routes from a LifeOS API key
 * (`Authorization: Bearer lifeos_...`). Returns null when missing/invalid.
 */
export async function resolveApiKeyUser(req: Request): Promise<string | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (lifeos_[a-f0-9]+)$/)?.[1];
  if (!bearer) return null;
  const key = (await convex().query(api.apiKeys.findByHash, {
    serviceKey: serviceKey(),
    hash: sha256Hex(bearer),
  })) as { _id: string; userId: string; lastUsedAt?: number } | null;
  if (!key) return null;

  // Best-effort, and throttled: knowing a key was used this hour is enough to
  // tell a live key from a forgotten one, and it must never fail the request.
  if (Date.now() - (key.lastUsedAt ?? 0) > TOUCH_INTERVAL_MS) {
    void convex()
      .mutation(api.apiKeys.touch, { serviceKey: serviceKey(), id: key._id })
      .catch(() => {});
  }
  return key.userId;
}

export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized. Pass a LifeOS API key as a Bearer token." }, { status: 401 });
}
