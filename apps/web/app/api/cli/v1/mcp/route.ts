import { listAccounts } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { mcpUrl } from "@/lib/env";
import { MCP_TOOLS } from "@/lib/mcpTools";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  const accounts = await listAccounts(userId);
  return Response.json({
    url: mcpUrl(),
    tools: MCP_TOOLS.map(([name, description]) => ({ name, description })),
    reaches: accounts.map((a) => ({ email: a.email, provider: a.provider, status: a.status })),
  });
}
