import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { McpReachSkeleton, McpShell } from "./parts";

/**
 * Prefetchable, so clicking "MCP connection" paints the endpoint and the
 * setup instructions immediately; only the account list and the tool
 * inventory below them wait on the round trip.
 */
export default function Loading() {
  return (
    <McpShell mcpUrl={mcpEndpoint()}>
      <McpReachSkeleton />
    </McpShell>
  );
}
