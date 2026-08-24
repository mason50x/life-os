import { authServerMetadataProxy, metadataCors } from "@/lib/oauthMetadata";

export const GET = authServerMetadataProxy;
const corsHandler = metadataCors();
export { corsHandler as OPTIONS };
