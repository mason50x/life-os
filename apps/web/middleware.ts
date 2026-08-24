import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { mcpHost } from "@/lib/env";

const authkit = authkitMiddleware({
  debug: true,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/"],
  },
});

// Browser-session routes: the only places AuthKit runs (the MCP endpoint and
// /api/cli/* authenticate themselves via AuthKit JWT / LifeOS API key).
const SESSION_PATHS = [
  /^\/$/,
  /^\/dashboard(\/|$)/,
  /^\/login$/,
  /^\/callback$/,
  /^\/connect(\/|$)/,
  /^\/api\/connect(\/|$)/,
];

// The dedicated MCP subdomain serves ONLY the MCP protocol surface: the
// transports and OAuth discovery metadata. Everything else is a 404 so the
// web app isn't mirrored onto that host.
const MCP_HOST_PATHS = [/^\/(mcp|sse|message)$/, /^\/\.well-known\//];

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const { pathname } = req.nextUrl;

  // Dedicated MCP subdomain (e.g. mcp.lifeos.you): its root IS the MCP
  // endpoint, authenticated by bearer tokens — never by a browser session.
  if (mcpHost() && host === mcpHost()) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/mcp", req.url));
    if (MCP_HOST_PATHS.some((re) => re.test(pathname))) return NextResponse.next();
    return new NextResponse("Not Found", { status: 404 });
  }

  if (SESSION_PATHS.some((re) => re.test(pathname))) return authkit(req, event);
  return NextResponse.next();
}

// Broad matcher (host rules need to see every path); the fine-grained routing
// above decides what actually runs. Static assets are excluded.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image.png|logo.png).*)",
  ],
};
