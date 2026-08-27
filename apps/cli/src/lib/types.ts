export type Provider = "gmail" | "outlook" | "icloud";
export type AccountStatus = "active" | "needs_reauth" | "disconnected";
export type Capability = "email" | "calendar";

export interface Account {
  id: string;
  userId: string;
  provider: Provider;
  email: string;
  displayName?: string;
  /** The name the user gave this account; absent means the default one. */
  nickname?: string;
  status: AccountStatus;
  /** Absent on a server that predates calendar support; read as mail-only. */
  capabilities?: Capability[];
  connectedAt: number;
}

export interface ApiKey {
  _id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface McpInfo {
  url: string;
  capabilities?: Capability[];
  groups?: { title: string; tier: "core" | "extended"; tools: { name: string; description: string }[] }[];
  tools: { name: string; description: string; tier?: "core" | "extended" }[];
  reaches: {
    email: string;
    provider: Provider;
    status: AccountStatus;
    capabilities?: Capability[];
  }[];
}

export interface AccountCheck {
  email: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface Me {
  userId: string;
  mcpUrl: string;
  accounts: number;
  keys: number;
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  icloud: "iCloud",
};

/** What connecting each provider brings. Outlook is mail-only for now. */
export const PROVIDER_CAPABILITIES: Record<Provider, Capability[]> = {
  gmail: ["email", "calendar"],
  outlook: ["email"],
  icloud: ["email", "calendar"],
};

/** Longest nickname the server will store — keep the field in step with it. */
export const MAX_ACCOUNT_NICKNAME = 40;

/**
 * The name an account goes by when nobody has renamed it: the address without
 * its domain, which is what people call these accounts out loud anyway.
 */
export function defaultAccountName(email: string): string {
  return email.split("@")[0] || email;
}

/** What one account is called — the user's name for it, or the default. */
export function accountName(account: Pick<Account, "email" | "nickname">): string {
  return account.nickname?.trim() || defaultAccountName(account.email);
}

/**
 * Names for a whole list, keyed by email. Defaults collide the moment someone
 * connects mason@gmail.com and mason@icloud.com, and two rows reading "mason"
 * help nobody — so a colliding default falls back to the full address, while a
 * nickname the user typed is left exactly as they typed it.
 */
export function accountNames(accounts: Pick<Account, "email" | "nickname">[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    if (a.nickname?.trim()) continue;
    const name = defaultAccountName(a.email).toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Map(
    accounts.map((a) => {
      const name = accountName(a);
      const ambiguous = !a.nickname?.trim() && (counts.get(name.toLowerCase()) ?? 0) > 1;
      return [a.email, ambiguous ? a.email : name];
    }),
  );
}

/** "Mail · Calendar" — what one account is actually good for. */
export function capabilityLabel(account: Pick<Account, "capabilities">): string {
  const capabilities = account.capabilities?.length ? account.capabilities : ["email"];
  return (["email", "calendar"] as const)
    .filter((c) => capabilities.includes(c))
    .map((c) => (c === "email" ? "Mail" : "Calendar"))
    .join(" · ");
}
