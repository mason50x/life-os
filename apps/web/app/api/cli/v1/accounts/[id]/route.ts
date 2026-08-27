import { removeAccount, renameAccount } from "@/lib/accounts";
import { cliError, cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();
  // The Convex mutation is ownership-checked, so a foreign id is a no-op here.
  await removeAccount(userId, (await params).id);
  return Response.json({ ok: true });
}

/** Rename an account. An absent or empty `name` restores the default one. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = body?.name;
  if (name !== undefined && typeof name !== "string") return cliError("name must be a string.");
  try {
    // Ownership lives in the mutation, which refuses a foreign id outright.
    const email = await renameAccount(userId, (await params).id, name);
    return Response.json({ ok: true, email });
  } catch (e) {
    return cliError(e instanceof Error ? e.message : String(e), 422);
  }
}
