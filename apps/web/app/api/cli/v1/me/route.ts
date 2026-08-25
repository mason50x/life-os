import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { listAccounts } from "@/lib/accounts";
import { listApiKeys } from "@/lib/apiKeys";
import { mcpUrl } from "@/lib/env";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  const [accounts, keys] = await Promise.all([listAccounts(userId), listApiKeys(userId)]);
  return Response.json({
    userId,
    mcpUrl: mcpUrl(),
    accounts: accounts.length,
    keys: keys.length,
  });
}
