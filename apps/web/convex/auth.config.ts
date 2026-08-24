// JWT validation for WorkOS AuthKit. Set in each Convex deployment:
//   npx convex env set WORKOS_CLIENT_ID <client id>          (per environment)
//   npx convex env set WORKOS_AUTHKIT_DOMAIN <authkit domain> (per environment)
const clientId = process.env.WORKOS_CLIENT_ID;

const rawDomain = (process.env.WORKOS_AUTHKIT_DOMAIN ?? "").replace(/\/$/, "");
const authkitDomain =
  rawDomain && !rawDomain.startsWith("http") ? `https://${rawDomain}` : rawDomain;

const authConfig = {
  providers: [
    // Session access tokens issued via the WorkOS User Management API
    // (what @workos-inc/authkit-nextjs puts in the browser session).
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    // Tokens issued by the AuthKit domain itself (MCP client OAuth flow).
    ...(authkitDomain
      ? [
          {
            type: "customJwt",
            issuer: authkitDomain,
            algorithm: "RS256",
            jwks: `${authkitDomain}/oauth2/jwks`,
          },
        ]
      : []),
  ],
};

export default authConfig;
