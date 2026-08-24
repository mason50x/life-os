import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  debug: true,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/"],
  },
});

// Only run AuthKit where a browser session is involved. The MCP endpoint and
// /api/cli/* authenticate themselves (AuthKit JWT / LifeOS API key).
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/login",
    "/callback",
    "/api/connect/:path*",
  ],
};
