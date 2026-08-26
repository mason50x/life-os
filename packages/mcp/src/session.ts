import type { ConnectedAccount, EmailProvider } from "@lifeos/core";

/**
 * Everything the tools need to act on behalf of one authenticated LifeOS user.
 * The host (Next.js MCP route) supplies this per-request from the verified token.
 */
export interface LifeOsSession {
  userId: string;
  listAccounts(): Promise<ConnectedAccount[]>;
  /** Resolve a connected account's email address to a live provider client. */
  providerFor(accountEmail: string): Promise<EmailProvider>;
}

/** Auth info shape provided by the host's bearer-token verification (withMcpAuth). */
export interface McpAuthInfo {
  extra?: Record<string, unknown>;
}

export type ResolveSession = (authInfo?: McpAuthInfo) => Promise<LifeOsSession>;

/**
 * Which halves of LifeOS a given connection exposes. Adding a surface means
 * extending this union, registering its tools behind the same gate, and
 * teaching `surfacesForAccounts` how to detect it.
 */
export type Surface = "email";

export const ALL_SURFACES: readonly Surface[] = ["email"];

/**
 * A tool is only worth advertising if the user has something for it to act on.
 * A Gmail-only user should never see calendar tools, and a user with nothing
 * connected sees only `list_accounts` — which tells them where to go next.
 */
export function surfacesForAccounts(accounts: ConnectedAccount[]): Surface[] {
  const surfaces: Surface[] = [];
  if (accounts.some((a) => a.status === "active")) surfaces.push("email");
  return surfaces;
}

export class ToolError extends Error {}

/**
 * Most people connect one inbox, so making `account` mandatory on every call
 * costs a round-trip to `list_accounts` for no information. Omitting it is
 * only ambiguous once there are two, and then the error says which.
 */
export async function resolveAccount(
  session: LifeOsSession,
  requested: string | undefined,
): Promise<string> {
  const accounts = await session.listAccounts();
  const active = accounts.filter((a) => a.status === "active");
  if (requested) {
    const match = accounts.find((a) => a.email.toLowerCase() === requested.toLowerCase());
    if (!match) {
      throw new ToolError(
        `No connected account "${requested}". Connected: ${
          accounts.map((a) => a.email).join(", ") || "(none)"
        }. Call list_accounts to see them.`,
      );
    }
    if (match.status !== "active") {
      throw new ToolError(
        `Account ${match.email} is ${match.status.replace("_", " ")} and can't be used until the ` +
          `user reconnects it in the LifeOS dashboard.`,
      );
    }
    return match.email;
  }
  if (active.length === 1) return active[0].email;
  if (active.length === 0) {
    throw new ToolError(
      "No email accounts are connected yet. The user needs to connect one in the LifeOS dashboard.",
    );
  }
  throw new ToolError(
    `More than one account is connected — pass \`account\` to say which: ${active
      .map((a) => a.email)
      .join(", ")}.`,
  );
}

/** Every active account, for tools that fan out when no account is named. */
export async function activeAccounts(session: LifeOsSession): Promise<string[]> {
  return (await session.listAccounts()).filter((a) => a.status === "active").map((a) => a.email);
}
