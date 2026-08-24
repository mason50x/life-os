import { api, convex, serviceKey } from "./convex";
import { sha256Hex } from "./crypto";

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
  })) as { userId: string } | null;
  return key?.userId ?? null;
}

export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized. Pass a LifeOS API key as a Bearer token." }, { status: 401 });
}
