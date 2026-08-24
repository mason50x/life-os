/** Read a required env var at call time (never at module load, so builds don't need secrets). */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Public MCP endpoint. With NEXT_PUBLIC_MCP_URL set to a root URL
 * (e.g. https://mcp.lifeos.you) the dedicated subdomain is the endpoint;
 * otherwise it's /mcp on the app domain.
 */
export function mcpUrl(): string {
  return (process.env.NEXT_PUBLIC_MCP_URL ?? `${appUrl()}/mcp`).replace(/\/$/, "");
}

/** Host of the dedicated MCP subdomain, or null when none is configured. */
export function mcpHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_MCP_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.pathname === "/" ? url.host : null;
  } catch {
    return null;
  }
}

/** AuthKit domain, e.g. https://your-app.authkit.app — the OAuth issuer for MCP clients. */
export function authkitDomain(): string {
  const raw = env("WORKOS_AUTHKIT_DOMAIN").replace(/\/$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/**
 * AuthKit OAuth callback URI. Prefer env (must match a WorkOS dashboard Redirect),
 * then NEXT_PUBLIC_APP_URL, then the request host so middleware does not throw
 * when NEXT_PUBLIC_WORKOS_REDIRECT_URI is unset in production.
 */
export function workosRedirectUri(req: { headers: { get(name: string): string | null } }): string {
  const fromEnv = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? process.env.WORKOS_REDIRECT_URI;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromApp = process.env.NEXT_PUBLIC_APP_URL;
  if (fromApp) return `${fromApp.replace(/\/$/, "")}/callback`;

  const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const host = rawHost?.split(",")[0]?.trim();
  if (!host) {
    throw new Error(
      "AuthKit redirect URI is not configured. Set NEXT_PUBLIC_WORKOS_REDIRECT_URI in the Vercel project to the callback URL registered in WorkOS (e.g. https://lifeos.you/callback).",
    );
  }

  const protoHeader = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = protoHeader ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}/callback`;
}
