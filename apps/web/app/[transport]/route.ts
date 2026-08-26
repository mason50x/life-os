import { handleMcpRequest } from "@/lib/mcpHandler";

/** The canonical endpoint: everything the user has connected, one connection. */
const guarded = async (
  req: Request,
  ctx: { params: Promise<{ transport: string }> },
): Promise<Response> => {
  const { transport } = await ctx.params;
  return handleMcpRequest(req, transport);
};

export { guarded as GET, guarded as POST, guarded as DELETE };
