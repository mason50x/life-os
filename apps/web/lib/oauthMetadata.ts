import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { appUrl } from "./env";

function authkitDomainRaw(): string {
  const raw = (process.env.WORKOS_AUTHKIT_DOMAIN ?? "example.authkit.app").replace(/\/$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

// RFC 9728 protected-resource metadata. Served at BOTH the root well-known
// path and the path-suffixed variant (/.well-known/oauth-protected-resource/mcp)
// because clients derive either form from the resource URL — ChatGPT uses the
// path-suffixed one. The resource is the MCP endpoint itself.
export const resourceMetadataHandler = () =>
  protectedResourceHandler({
    authServerUrls: [authkitDomainRaw()],
    resourceUrl: `${appUrl()}/mcp`,
  });

export const metadataCors = metadataCorsOptionsRequestHandler;

// Legacy compatibility: older MCP clients skip RFC 9728 and fetch the OAuth
// authorization-server metadata directly from the resource server's domain.
// Proxy AuthKit's metadata so that path works here too.
export async function authServerMetadataProxy(): Promise<Response> {
  const res = await fetch(`${authkitDomainRaw()}/.well-known/oauth-authorization-server`);
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
