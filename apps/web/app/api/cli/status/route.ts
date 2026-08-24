import { listAccounts } from "@/lib/accounts";
import { resolveApiKeyUser, unauthorized } from "@/lib/apiAuth";
import { mcpUrl } from "@/lib/env";

export async function GET(req: Request) {
  const userId = await resolveApiKeyUser(req);
  if (!userId) return unauthorized();
  const accounts = await listAccounts(userId);
  return Response.json({
    userId,
    mcpUrl: mcpUrl(),
    accounts: accounts.map((a) => ({
      email: a.email,
      provider: a.provider,
      status: a.status,
    })),
  });
}
