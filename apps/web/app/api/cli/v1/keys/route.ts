import { listApiKeys, mintApiKey } from "@/lib/apiKeys";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function GET(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  return Response.json({ keys: await listApiKeys(userId) });
}

export async function POST(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  // The raw key is in this response and nowhere else, ever again.
  return Response.json(await mintApiKey(userId, body?.name ?? ""));
}
