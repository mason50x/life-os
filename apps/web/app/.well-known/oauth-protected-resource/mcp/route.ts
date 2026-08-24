import { metadataCors, resourceMetadataHandler } from "@/lib/oauthMetadata";

// RFC 9728 path-suffixed form for the resource at /mcp (used by ChatGPT).
const handler = resourceMetadataHandler();
const corsHandler = metadataCors();

export { handler as GET, corsHandler as OPTIONS };
