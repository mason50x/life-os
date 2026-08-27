import { Suspense } from "react";
import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { accountsOf, session } from "../data";
import { McpReachSkeleton, McpShell } from "./parts";
import { McpReachLive } from "./reach";

export default function McpConnection() {
  return (
    <McpShell mcpUrl={mcpEndpoint()}>
      <Suspense fallback={<McpReachSkeleton />}>
        <Reach />
      </Suspense>
    </McpShell>
  );
}

/**
 * The half of the page that depends on what's connected, behind its own
 * boundary: the endpoint and the instructions above it don't wait on Convex.
 * This fetch is only the first paint — McpReachLive subscribes from there.
 */
async function Reach() {
  const { user } = await session();
  return <McpReachLive initialAccounts={await accountsOf(user.id)} />;
}
