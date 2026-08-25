import { cliError, cliUnauthorized, resolveCliUser } from "@/lib/cliAuth";
import { connectIcloudAccount } from "@/lib/icloudConnect";

export async function POST(req: Request) {
  const userId = await resolveCliUser(req);
  if (!userId) return cliUnauthorized();

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    sendAs?: string[];
  } | null;
  if (!body?.email || !body?.password) return cliError("email and password are required.");

  const result = await connectIcloudAccount(userId, {
    email: body.email,
    password: body.password,
    sendAs: body.sendAs,
  });
  if ("error" in result) return cliError(result.error, 422);
  return Response.json(result);
}
