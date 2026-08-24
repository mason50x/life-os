import { metadataCors, rootResourceMetadata } from "@/lib/oauthMetadata";

const corsHandler = metadataCors();

export { rootResourceMetadata as GET, corsHandler as OPTIONS };
