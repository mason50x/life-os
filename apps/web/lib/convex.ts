import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { env } from "./env";

// anyApi keeps the app compiling before `convex dev` generates typed bindings.
// Run `pnpm --filter @lifeos/web convex` once to provision + codegen.
export const api = anyApi;

export function convex(): ConvexHttpClient {
  return new ConvexHttpClient(env("NEXT_PUBLIC_CONVEX_URL"));
}

/** Client acting as the signed-in user: Convex validates the AuthKit JWT (see convex/auth.config.ts). */
export function convexAsUser(accessToken: string): ConvexHttpClient {
  const client = new ConvexHttpClient(env("NEXT_PUBLIC_CONVEX_URL"));
  client.setAuth(accessToken);
  return client;
}

/** Shared secret proving calls come from the LifeOS backend, not an arbitrary client. */
export function serviceKey(): string {
  return env("LIFEOS_SERVICE_KEY");
}
