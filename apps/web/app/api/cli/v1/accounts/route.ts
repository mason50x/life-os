import { listAccounts } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  return Response.json({ accounts: await listAccounts(userId) });
}
