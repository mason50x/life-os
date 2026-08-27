import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_SURFACES, type ResolveSession, type Surface } from "./session";
import { collectSpecs, registerSpec, specsFor } from "./registry";
import { registerDiscoveryTools } from "./tools/discover";

export { SERVER_INSTRUCTIONS } from "./instructions";
export { collectSpecs, jsonSchemaFor, specsFor, type ToolSpec } from "./registry";
export {
  ALL_SURFACES,
  surfacesForAccounts,
  type LifeOsSession,
  type McpAuthInfo,
  type ResolveSession,
  type Surface,
} from "./session";

export interface RegisterOptions {
  /**
   * Which surfaces this connection exposes, derived per request from what the
   * user actually has linked. A tool the user has nothing to point at is worse
   * than absent: it takes up a slot in the client's cap, costs context on
   * every conversation, and gives the model a way to fail.
   */
  surfaces?: readonly Surface[];
  /**
   * "auto" advertises the everyday tools and puts the long tail behind
   * find_tools/run_tool — around fifteen schemas instead of forty, with
   * nothing lost. "all" registers every tool directly, for a client that would
   * rather pay the context and skip the indirection.
   */
  tools?: "auto" | "all";
}

export function registerLifeOsTools(
  server: McpServer,
  resolveSession: ResolveSession,
  options: RegisterOptions = {},
) {
  // Each handler receives (args, extra); extra.authInfo carries the verified
  // bearer token context injected by withMcpAuth in the host app.
  const session = (extra: unknown) =>
    resolveSession((extra as { authInfo?: Parameters<ResolveSession>[0] } | undefined)?.authInfo);

  const surfaces = options.surfaces ?? ALL_SURFACES;
  // list_accounts is surface "core": a user who connects a client before
  // linking anything would otherwise see an empty server and no way forward.
  const reachable = specsFor(collectSpecs(session), surfaces);

  if (options.tools === "all") {
    reachable.forEach((spec) => registerSpec(server, spec));
    return;
  }

  const visible = reachable.filter((spec) => spec.tier === "core");
  const hidden = reachable.filter((spec) => spec.tier !== "core");
  visible.forEach((spec) => registerSpec(server, spec));
  // With nothing connected there is no long tail to search, and a find_tools
  // that can only report an empty catalogue is noise.
  if (hidden.length) registerDiscoveryTools(server, { hidden, visible });
}
