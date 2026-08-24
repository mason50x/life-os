import { mcpPathResourceMetadata, metadataCors } from "@/lib/oauthMetadata";

// RFC 9728 path-suffixed form for the resource at /mcp (used by ChatGPT).
const corsHandler = metadataCors();

export { mcpPathResourceMetadata as GET, corsHandler as OPTIONS };
