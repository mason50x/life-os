import { accountName } from "@lifeos/core";
import type { CalendarProvider, Capability, ConnectedAccount, EmailProvider } from "@lifeos/core";

/**
 * Everything the tools need to act on behalf of one authenticated LifeOS user.
 * The host (Next.js MCP route) supplies this per-request from the verified token.
 */
export interface LifeOsSession {
  userId: string;
  listAccounts(): Promise<ConnectedAccount[]>;
  /** Resolve a connected account's email address to a live provider client. */
  providerFor(accountEmail: string): Promise<EmailProvider>;
  /** The same account's calendar. Throws when the grant doesn't cover it. */
  calendarFor(accountEmail: string): Promise<CalendarProvider>;
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
export type Surface = "email" | "calendar";

export const ALL_SURFACES: readonly Surface[] = ["email", "calendar"];

/**
 * A tool is only worth advertising if the user has something for it to act on.
 * A mail-only Gmail grant should never show calendar tools, and a user with
 * nothing connected sees only `list_accounts` — which tells them where to go
 * next.
 */
export function surfacesForAccounts(accounts: ConnectedAccount[]): Surface[] {
  const active = accounts.filter((a) => a.status === "active");
  return ALL_SURFACES.filter((surface) =>
    active.some((a) => a.capabilities.includes(surface as Capability)),
  );
}

export class ToolError extends Error {}

/** What the user should be told to do when nothing can serve a capability. */
const NOTHING_CONNECTED: Record<Capability, string> = {
  email: "No email accounts are connected yet. The user needs to connect one in the LifeOS dashboard.",
  calendar:
    "No calendars are connected yet. Google and Apple accounts bring their calendar along with " +
    "their mail — if the user connected an inbox before calendar support existed, one click on " +
    '"Enable calendar" in the LifeOS dashboard adds it to the connection they already made.',
};

/**
 * Most people connect one account, so making `account` mandatory on every call
 * costs a round-trip to `list_accounts` for no information. Omitting it is
 * only ambiguous once there are two, and then the error says which.
 *
 * `capability` narrows the field to accounts that can actually serve the tool
 * asking: with one calendar and three inboxes connected, a calendar tool
 * shouldn't make the model choose between four.
 */
export async function resolveAccount(
  session: LifeOsSession,
  requested: string | undefined,
  capability: Capability = "email",
): Promise<string> {
  const accounts = await session.listAccounts();
  const usable = accounts.filter(
    (a) => a.status === "active" && a.capabilities.includes(capability),
  );
  if (requested) {
    // Address first, then the name the user knows the account by — "personal"
    // is what they say out loud, and it's what list_accounts hands the model.
    const wanted = requested.trim().toLowerCase();
    const match =
      accounts.find((a) => a.email.toLowerCase() === wanted) ??
      accounts.find((a) => accountName(a).toLowerCase() === wanted);
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
    if (!match.capabilities.includes(capability)) {
      throw new ToolError(
        `${match.email} is connected for ${match.capabilities.join(" and ")} only, not ${capability}. ` +
          `The user can add ${capability} from the LifeOS dashboard — one click on "Enable ` +
          `${capability}", no password or consent screen in the usual case.` +
          (usable.length
            ? ` Accounts that do have ${capability}: ${usable.map((a) => a.email).join(", ")}.`
            : ""),
      );
    }
    return match.email;
  }
  if (usable.length === 1) return usable[0].email;
  if (usable.length === 0) throw new ToolError(NOTHING_CONNECTED[capability]);
  throw new ToolError(
    `More than one account has ${capability} — pass \`account\` to say which: ${usable
      .map((a) => a.email)
      .join(", ")}.`,
  );
}

/** Every active account for a capability, for tools that fan out by default. */
export async function activeAccounts(
  session: LifeOsSession,
  capability: Capability = "email",
): Promise<string[]> {
  return (await session.listAccounts())
    .filter((a) => a.status === "active" && a.capabilities.includes(capability))
    .map((a) => a.email);
}
