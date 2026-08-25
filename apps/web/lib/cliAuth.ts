import { createRemoteJWKSet, jwtVerify } from "jose";
import { resolveApiKeyUser } from "./apiAuth";
import { env } from "./env";

/**
 * WorkOS signs AuthKit access tokens — including the ones the CLI receives from
 * the device authorization flow — with the same key set Convex already trusts
 * (see convex/auth.config.ts). Built once per process: createRemoteJWKSet caches
 * the fetched keys internally, and rebuilding it per request throws that away.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keySet(clientId: string) {
  jwks ??= createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
  return jwks;
}

async function resolveAccessTokenUser(token: string): Promise<string | null> {
  try {
    const clientId = env("WORKOS_CLIENT_ID");
    const { payload } = await jwtVerify(token, keySet(clientId), {
      issuer: `https://api.workos.com/user_management/${clientId}`,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the acting user for CLI-facing API routes. The CLI signs in through
 * WorkOS and presents an access token; API keys stay supported for scripts, CI,
 * and the already-published 0.1.0 CLI.
 */
export async function resolveCliUser(req: Request): Promise<string | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) return null;
  if (bearer.startsWith("lifeos_")) return resolveApiKeyUser(req);
  return resolveAccessTokenUser(bearer);
}

export function cliUnauthorized(): Response {
  return Response.json(
    { error: "Unauthorized. Run `lifeos login`, or pass a LifeOS API key as a Bearer token." },
    { status: 401 },
  );
}

/** Shape every CLI route uses for a failure, so the client can render it directly. */
export function cliError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
