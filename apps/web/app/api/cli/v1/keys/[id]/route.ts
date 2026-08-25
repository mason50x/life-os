import { revokeApiKey } from "@/lib/apiKeys";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  await revokeApiKey(userId, (await params).id);
  return Response.json({ ok: true });
}
