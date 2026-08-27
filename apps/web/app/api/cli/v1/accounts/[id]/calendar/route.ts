import { enableCalendar } from "@/lib/accounts";
import { cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

/**
 * Add calendar to an account already connected for mail, using the credential
 * on file. A 422 carries the reconnect the terminal should offer instead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();

  // Ownership lives in enableCalendar, which looks the id up among the
  // caller's own accounts — same as /check.
  const result = await enableCalendar(userId, (await params).id);
  if ("error" in result) {
    return Response.json({ error: result.error, reconnect: result.reconnect }, { status: 422 });
  }
  return Response.json(result);
}
