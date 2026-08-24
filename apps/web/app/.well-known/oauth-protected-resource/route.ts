import { metadataCors, resourceMetadataHandler } from "@/lib/oauthMetadata";

const handler = resourceMetadataHandler();
const corsHandler = metadataCors();

export { handler as GET, corsHandler as OPTIONS };
