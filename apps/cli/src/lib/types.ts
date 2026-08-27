export type Provider = "gmail" | "outlook" | "icloud";
export type AccountStatus = "active" | "needs_reauth" | "disconnected";
export type Capability = "email" | "calendar";

export interface Account {
  id: string;
  userId: string;
  provider: Provider;
  email: string;
  displayName?: string;
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

/** "Mail · Calendar" — what one account is actually good for. */
export function capabilityLabel(account: Pick<Account, "capabilities">): string {
  const capabilities = account.capabilities?.length ? account.capabilities : ["email"];
  return (["email", "calendar"] as const)
    .filter((c) => capabilities.includes(c))
    .map((c) => (c === "email" ? "Mail" : "Calendar"))
    .join(" · ");
}
