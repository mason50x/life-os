import { appUrl, authkitDomain, env, mcpUrl } from "@/lib/env";

/**
 * Unauthenticated bootstrap for the CLI: everything it needs to start a sign-in
 * against this instance. Nothing here is secret — the WorkOS client id is public
 * by design in a device-authorization flow — and serving it means the CLI has no
 * hardcoded knowledge of any particular deployment.
 */
export async function GET() {
  return Response.json({
    appUrl: appUrl(),
    mcpUrl: mcpUrl(),
    authkitDomain: authkitDomain(),
    workosClientId: env("WORKOS_CLIENT_ID"),
  });
}
