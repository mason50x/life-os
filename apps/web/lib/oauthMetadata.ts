import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { appUrl, mcpHost } from "./env";

function authkitDomainRaw(): string {
  const raw = (process.env.WORKOS_AUTHKIT_DOMAIN ?? "example.authkit.app").replace(/\/$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function requestOrigin(req: Request): { origin: string; host: string } {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return { origin: `${proto}://${host}`, host };
}

// RFC 9728 protected-resource metadata. Served at BOTH the root well-known
// path and the path-suffixed variant (/.well-known/oauth-protected-resource/mcp)
// because clients derive either form from the resource URL — ChatGPT uses the
// path-suffixed one. The resource identifier must match the URL the client
// actually connected to, so it is derived per-request:
//   - on the dedicated MCP subdomain the resource is the host root
//   - on the app domain the resource is /mcp
function metadataResponse(resource: string): Response {
  return Response.json(
    {
      resource,
      authorization_servers: [authkitDomainRaw()],
      bearer_methods_supported: ["header"],
      resource_name: "LifeOS",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

/** Root form: /.well-known/oauth-protected-resource */
export function rootResourceMetadata(req: Request): Response {
  const { origin, host } = requestOrigin(req);
  return metadataResponse(host === mcpHost() ? origin : `${appUrl()}/mcp`);
}

/** Path-suffixed form for the resource at /mcp on the requested host. */
export function mcpPathResourceMetadata(req: Request): Response {
  return metadataResponse(`${requestOrigin(req).origin}/mcp`);
}

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
