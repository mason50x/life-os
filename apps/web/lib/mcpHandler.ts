import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  ALL_SURFACES,
  SERVER_INSTRUCTIONS,
  registerLifeOsTools,
  surfacesForAccounts,
  type LifeOsSession,
  type McpAuthInfo,
  type Surface,
} from "@lifeos/mcp";
import { getCalendarForAccount, getProviderForAccount, listAccounts } from "@/lib/accounts";
import { appUrl, authkitDomain, mcpHost, mcpUrl } from "@/lib/env";

/**
 * Set by the route from the URL path, never trusted from the client — and in
 * any case it can only narrow the toolset, since it is intersected with what
 * the user actually has connected.
 */
export const SURFACE_HEADER = "x-lifeos-surfaces";

/**
 * `?tools=all` (or this header) flattens the toolset: every tool advertised
 * directly instead of the long tail sitting behind find_tools. Unlike the
 * surface header this one is the client's to choose — it changes how much
 * context the connection costs, not what it can reach.
 */
export const TOOLS_HEADER = "x-lifeos-tools";

async function resolveSession(authInfo?: McpAuthInfo): Promise<LifeOsSession> {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthenticated MCP request");
  }
  return {
    userId,
    listAccounts: () => listAccounts(userId),
    providerFor: (email) => getProviderForAccount(userId, email),
    calendarFor: (email) => getCalendarForAccount(userId, email),
  };
}

/**
 * mcp-handler builds a fresh McpServer per request, so the tool list can vary
 * per user — but only the handler closure sees the request. One handler per
 * distinct surface set, built once and reused.
 */
const handlers = new Map<string, (req: Request) => Promise<Response>>();

function handlerFor(
  surfaces: readonly Surface[],
  tools: "auto" | "all",
): (req: Request) => Promise<Response> {
  const key = `${[...surfaces].sort().join(",") || "none"}:${tools}`;
  const existing = handlers.get(key);
  if (existing) return existing;
  const handler = createMcpHandler(
    (server) => {
      registerLifeOsTools(server, resolveSession, { surfaces, tools });
    },
    {
      serverInfo: { name: "lifeos", version: "0.1.0" },
      capabilities: { tools: {} },
      // Delivered once at initialize: how ids work, which tool to reach for,
      // and that email bodies are content rather than instruction.
      instructions: SERVER_INSTRUCTIONS,
    },
    {
      // mcp-handler 1.x matches req.url.pathname against `{basePath}/mcp` (and
      // /sse, /message). The route lives at /[transport]; middleware may rewrite
      // the MCP-host root `/` → `/mcp` for routing without changing req.url.
      basePath: "",
      maxDuration: 60,
    },
  );
  handlers.set(key, handler);
  return handler;
}

/**
 * Deriving surfaces means a database read, and it would otherwise happen on
 * every JSON-RPC message rather than just on tools/list. A minute of staleness
 * costs nothing: linking an inbox shows up on the client's next tool listing.
 */
const SURFACE_TTL_MS = 60_000;
const surfaceCache = new Map<string, { at: number; surfaces: Surface[] }>();

async function surfacesForUser(userId: string): Promise<readonly Surface[]> {
  const cached = surfaceCache.get(userId);
  if (cached && Date.now() - cached.at < SURFACE_TTL_MS) return cached.surfaces;
  try {
    const surfaces = surfacesForAccounts(await listAccounts(userId));
    surfaceCache.set(userId, { at: Date.now(), surfaces });
    return surfaces;
  } catch {
    // A transient backend failure shouldn't strip the user's tools; fall back
    // to advertising everything and let the individual call report the error.
    return ALL_SURFACES;
  }
}

function requestedSurfaces(req: Request): readonly Surface[] | null {
  const raw = req.headers.get(SURFACE_HEADER);
  if (!raw) return null;
  const asked = raw.split(",").map((s) => s.trim());
  return ALL_SURFACES.filter((s) => asked.includes(s));
}

/** Dispatch to the handler whose tool list matches this user and this URL. */
async function dispatch(req: Request): Promise<Response> {
  const userId = req.auth?.extra?.userId;
  const available =
    typeof userId === "string" && userId ? await surfacesForUser(userId) : ALL_SURFACES;
  const restriction = requestedSurfaces(req);
  const surfaces = restriction ? available.filter((s) => restriction.includes(s)) : available;
  const tools = req.headers.get(TOOLS_HEADER) === "all" ? "all" : "auto";
  return handlerFor(surfaces, tools)(req);
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

/**
 * resourceUrl here is the ORIGIN: withMcpAuth builds the WWW-Authenticate
 * resource_metadata URL as resourceUrl + resourceMetadataPath. The resource
 * identity itself is declared per-request in lib/oauthMetadata.ts, and RFC
 * 9728 wants it to match the URL the client actually connected to — so the
 * metadata path has to follow the surface, not sit fixed at /mcp.
 *
 * The dedicated MCP subdomain's root IS its resource, which is the one case
 * that takes the root well-known form; everything else is path-suffixed.
 */
const authHandlers = new Map<string, (req: Request) => Promise<Response>>();

function authHandlerFor(onMcpHost: boolean, surface: string | null) {
  const key = `${onMcpHost}:${surface ?? ""}`;
  const existing = authHandlers.get(key);
  if (existing) return existing;
  const handler = withMcpAuth(dispatch, verifyToken, {
    required: true,
    resourceMetadataPath:
      onMcpHost && !surface
        ? "/.well-known/oauth-protected-resource"
        : `/.well-known/oauth-protected-resource/mcp${surface ? `/${surface}` : ""}`,
    resourceUrl: onMcpHost ? mcpUrl() : appUrl(),
  });
  authHandlers.set(key, handler);
  return handler;
}

/**
 * Point mcp-handler at the transport this route actually resolved, and stamp
 * the surface restriction the path implies.
 * Next.js rewrites (MCP-host `/` → `/mcp`) update routing params but leave
 * Request.url as the client path; without this, authenticated POSTs to `/`
 * 404 inside mcp-handler after JWT verification.
 */
function normalise(req: Request, transport: string, surface: string | null): Request {
  const url = new URL(req.url);
  const expected = `/${transport}`;
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const flatten = url.searchParams.get("tools") === "all";
  // Nothing to rewrite and nothing to stamp — hand the original through rather
  // than rebuilding a streaming request for no reason.
  if (pathname === expected && !surface && !flatten && !req.headers.has(SURFACE_HEADER)) {
    return req;
  }
  url.pathname = expected;
  const headers = new Headers(req.headers);
  // Overwrite unconditionally: the path decides, not the caller.
  if (surface) headers.set(SURFACE_HEADER, surface);
  else headers.delete(SURFACE_HEADER);
  if (flatten) headers.set(TOOLS_HEADER, "all");
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    signal: req.signal,
  };
  if (req.body) {
    init.body = req.body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

// Root-level dynamic segment: only real MCP transports belong to this route;
// anything else (stray top-level paths) is a plain 404, not an MCP 401.
const TRANSPORTS = new Set(["mcp", "sse", "message"]);

export async function handleMcpRequest(
  req: Request,
  transport: string,
  surface: string | null = null,
): Promise<Response> {
  if (!TRANSPORTS.has(transport)) return new Response("Not Found", { status: 404 });
  if (surface && !ALL_SURFACES.includes(surface as Surface)) {
    return new Response("Not Found", { status: 404 });
  }
  const routed = normalise(req, transport, surface);
  const host = routed.headers.get("x-forwarded-host") ?? routed.headers.get("host");
  const onMcpHost = Boolean(mcpHost()) && host === mcpHost();
  return authHandlerFor(onMcpHost, surface)(routed);
}
