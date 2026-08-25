import { checkAccount, listAccounts } from "@/lib/accounts";
import { cliError, cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();

  const { id } = await params;
  // Look the id up in the caller's own accounts rather than trusting it: this is
  // what scopes the check to the signed-in user.
  const account = (await listAccounts(userId)).find((a) => a.id === id);
  if (!account) return cliError("No such connected account.", 404);

  return Response.json({ email: account.email, ...(await checkAccount(userId, account.email)) });
}
