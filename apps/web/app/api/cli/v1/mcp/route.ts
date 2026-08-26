import { listAccounts } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { mcpUrl } from "@/lib/env";
import { toolsFor } from "@/lib/mcpTools";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  const accounts = await listAccounts(userId);
  // Report the tools this user's connection really advertises, not the full
  // catalogue — the endpoint gates on what they have connected.
  const tools = toolsFor(accounts.some((a) => a.status === "active"));
  return Response.json({
    url: mcpUrl(),
    tools: tools.map(([name, description]) => ({ name, description })),
    reaches: accounts.map((a) => ({ email: a.email, provider: a.provider, status: a.status })),
  });
}
