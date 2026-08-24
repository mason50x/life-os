import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { registerLifeOsTools, type LifeOsSession, type McpAuthInfo } from "@lifeos/mcp";
import { getProviderForAccount, listAccounts } from "@/lib/accounts";
import { appUrl, authkitDomain, mcpHost, mcpUrl } from "@/lib/env";

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
    // mcp-handler 1.x matches req.url.pathname against `{basePath}/mcp` (and
    // /sse, /message). The route lives at /[transport]; middleware may rewrite
    // the MCP-host root `/` → `/mcp` for routing without changing req.url.
    basePath: "",
    maxDuration: 60,
  },
);

/**
 * Point mcp-handler at the transport this route actually resolved.
 * Next.js rewrites (MCP-host `/` → `/mcp`) update routing params but leave
 * Request.url as the client path; without this, authenticated POSTs to `/`
 * 404 inside mcp-handler after JWT verification.
 */
function requestForTransport(req: Request, transport: string): Request {
  const url = new URL(req.url);
  const expected = `/${transport}`;
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (pathname === expected) return req;
  url.pathname = expected;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: req.headers,
    signal: req.signal,
  };
  if (req.body) {
    init.body = req.body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

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
// identity itself is declared per-request in lib/oauthMetadata.ts. Two
// handlers because the dedicated MCP subdomain's resource is its root (root
// well-known form), while the app domain's resource is /mcp (path-suffixed).
const appAuthHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  resourceUrl: appUrl(),
});

const mcpHostAuthHandler = mcpHost()
  ? withMcpAuth(handler, verifyToken, {
      required: true,
      resourceMetadataPath: "/.well-known/oauth-protected-resource",
      resourceUrl: mcpUrl(),
    })
  : null;

// Root-level dynamic segment: only real MCP transports belong to this route;
// anything else (stray top-level paths) is a plain 404, not an MCP 401.
const TRANSPORTS = new Set(["mcp", "sse", "message"]);

const guarded = async (
  req: Request,
  ctx: { params: Promise<{ transport: string }> },
): Promise<Response> => {
  const { transport } = await ctx.params;
  if (!TRANSPORTS.has(transport)) return new Response("Not Found", { status: 404 });
  const routed = requestForTransport(req, transport);
  const host = routed.headers.get("x-forwarded-host") ?? routed.headers.get("host");
  const useMcpHost = mcpHostAuthHandler !== null && host === mcpHost();
  return (useMcpHost ? mcpHostAuthHandler : appAuthHandler)(routed);
};

export { guarded as GET, guarded as POST, guarded as DELETE };
