/** Read a required env var at call time (never at module load, so builds don't need secrets). */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** AuthKit domain, e.g. https://your-app.authkit.app — the OAuth issuer for MCP clients. */
export function authkitDomain(): string {
  const raw = env("WORKOS_AUTHKIT_DOMAIN").replace(/\/$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}
