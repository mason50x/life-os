import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { registerLifeOsTools, type LifeOsSession, type McpAuthInfo } from "@lifeos/mcp";
import { getProviderForAccount, listAccounts } from "@/lib/accounts";
import { appUrl, authkitDomain } from "@/lib/env";

async function resolveSession(authInfo?: McpAuthInfo): Promise<LifeOsSession> {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthenticated MCP request");
  }
  return {
    userId,
    listAccounts: () => listAccounts(userId),
    providerFor: (email) => getProviderForAccount(userId, email),
  };
}

const handler = createMcpHandler(
  (server) => {
    registerLifeOsTools(server, resolveSession);
  },
  {
    serverInfo: { name: "lifeos", version: "0.1.0" },
    capabilities: { tools: {} },
  },
  {
    // Served natively at /mcp (app/[transport]/route.ts) — no rewrite, so the
    // request pathname mcp-handler validates matches what clients actually hit.
    basePath: "",
    maxDuration: 60,
  },
);

// MCP clients authenticate with AuthKit-issued JWTs (AuthKit is the OAuth
// authorization server; it supports dynamic client registration out of the box).
const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  try {
    const issuer = authkitDomain();
    const jwks = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`));
    const { payload } = await jwtVerify(bearerToken, jwks, { issuer });
    if (!payload.sub) return undefined;
    return {
      token: bearerToken,
      clientId: (payload.client_id as string) ?? "unknown",
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
      expiresAt: payload.exp,
      extra: { userId: payload.sub },
    };
  } catch {
    return undefined;
  }
};

// resourceUrl here is the ORIGIN: withMcpAuth builds the WWW-Authenticate
// resource_metadata URL as resourceUrl + resourceMetadataPath. The resource
// identity itself (origin + /mcp) is declared in lib/oauthMetadata.ts.
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  resourceUrl: appUrl(),
});

// Root-level dynamic segment: only real MCP transports belong to this route;
// anything else (stray top-level paths) is a plain 404, not an MCP 401.
const TRANSPORTS = new Set(["mcp", "sse", "message"]);

const guarded = async (
  req: Request,
  ctx: { params: Promise<{ transport: string }> },
): Promise<Response> => {
  const { transport } = await ctx.params;
  if (!TRANSPORTS.has(transport)) return new Response("Not Found", { status: 404 });
  return authHandler(req);
};

export { guarded as GET, guarded as POST, guarded as DELETE };
