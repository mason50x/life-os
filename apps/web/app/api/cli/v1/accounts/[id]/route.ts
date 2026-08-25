import { removeAccount } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  // The Convex mutation is ownership-checked, so a foreign id is a no-op here.
  await removeAccount(userId, (await params).id);
  return Response.json({ ok: true });
}
