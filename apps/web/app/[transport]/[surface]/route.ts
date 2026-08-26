import { handleMcpRequest } from "@/lib/mcpHandler";

/**
 * Per-surface endpoint — `/mcp/email` — for wiring up a narrow agent that
 * shouldn't reach the rest of the account. `/mcp` stays the one URL to paste;
 * this is the escape hatch, not the default.
 */
const guarded = async (
  req: Request,
  ctx: { params: Promise<{ transport: string; surface: string }> },
): Promise<Response> => {
  const { transport, surface } = await ctx.params;
  return handleMcpRequest(req, transport, surface);
};

export { guarded as GET, guarded as POST, guarded as DELETE };
