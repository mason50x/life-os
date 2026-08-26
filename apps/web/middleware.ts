import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { mcpHost, workosRedirectUri } from "@/lib/env";

function runAuthkit(req: NextRequest, event: NextFetchEvent) {
  // Built per request so redirectUri can fall back to the request host when
  // NEXT_PUBLIC_WORKOS_REDIRECT_URI is missing (AuthKit throws otherwise).
  return authkitMiddleware({
    // Logs session and redirect internals. Fine locally, noise-plus-disclosure
    // in production.
    debug: process.env.NODE_ENV !== "production",
    redirectUri: workosRedirectUri(req),
    middlewareAuth: {
      // /login is public so its route handler runs and picks the AuthKit URL
      // itself — sign-up needs `prompt=consent` to get a Google refresh token.
      // The handler redirects to AuthKit regardless, so nothing is left open.
      enabled: true,
      // /cli/done is a message page shown after the browser half of a CLI connect
      // finishes; it must render even for someone who has since signed out.
      unauthenticatedPaths: ["/", "/login", "/cli/done"],
    },
  })(req, event);
}

// Browser-session routes: the only places AuthKit runs (the MCP endpoint and
// /api/cli/* authenticate themselves via AuthKit JWT / LifeOS API key).
const SESSION_PATHS = [
  /^\/$/,
  /^\/dashboard(\/|$)/,
  /^\/login$/,
  /^\/callback$/,
  /^\/connect(\/|$)/,
  /^\/api\/connect(\/|$)/,
  // The browser half of a CLI connect. Not /api/cli/*, which authenticates
  // itself with a WorkOS access token or a LifeOS API key.
  /^\/cli(\/|$)/,
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

  if (SESSION_PATHS.some((re) => re.test(pathname))) return runAuthkit(req, event);
  return NextResponse.next();
}

// Broad matcher (host rules need to see every path); the fine-grained routing
// above decides what actually runs. Static assets are excluded.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image.png|logo.png).*)",
  ],
};
