import { listAccounts } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { mcpUrl } from "@/lib/env";
import { capabilitiesOf, groupsFor } from "@/lib/mcpTools";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  const accounts = await listAccounts(userId);
  // Report the tools this user's connection really advertises, not the full
  // catalogue — the endpoint gates on what they have connected.
  const capabilities = capabilitiesOf(accounts);
  const groups = groupsFor(capabilities);
  return Response.json({
    url: mcpUrl(),
    capabilities,
    groups: groups.map((g) => ({
      title: g.title,
      tier: g.tier,
      tools: g.tools.map(([name, description]) => ({ name, description })),
    })),
    tools: groups.flatMap((g) =>
      g.tools.map(([name, description]) => ({ name, description, tier: g.tier })),
    ),
    reaches: accounts.map((a) => ({
      email: a.email,
      provider: a.provider,
      status: a.status,
      capabilities: a.capabilities,
    })),
  });
}
