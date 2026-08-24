import { listAccounts } from "@/lib/accounts";
import { resolveApiKeyUser, unauthorized } from "@/lib/apiAuth";

export async function GET(req: Request) {
  const userId = await resolveApiKeyUser(req);
  if (!userId) return unauthorized();
  return Response.json({ accounts: await listAccounts(userId) });
}
