import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_SURFACES, type ResolveSession, type Surface } from "./session";
import type { Kit } from "./tools/shared";
import { registerAccountTools, registerLabelTools } from "./tools/accounts";
import { registerReadTools } from "./tools/read";
import { registerSendTools } from "./tools/send";
import { registerOrganizeTools } from "./tools/organize";
import { registerDraftTools } from "./tools/drafts";
import { registerAttachmentTools } from "./tools/attachments";

export { SERVER_INSTRUCTIONS } from "./instructions";
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
}

export function registerLifeOsTools(
  server: McpServer,
  resolveSession: ResolveSession,
  options: RegisterOptions = {},
) {
  // Each handler receives (args, extra); extra.authInfo carries the verified
  // bearer token context injected by withMcpAuth in the host app.
  const kit: Kit = {
    server,
    session: (extra) =>
      resolveSession((extra as { authInfo?: Parameters<ResolveSession>[0] } | undefined)?.authInfo),
  };

  const surfaces = options.surfaces ?? ALL_SURFACES;

  // list_accounts is unconditional: a user who connects a client before
  // linking an inbox would otherwise see an empty server and no way forward.
  registerAccountTools(kit);

  if (surfaces.includes("email")) {
    registerLabelTools(kit);
    registerReadTools(kit);
    registerSendTools(kit);
    registerDraftTools(kit);
    registerOrganizeTools(kit);
    registerAttachmentTools(kit);
  }
}
