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
