export type Provider = "gmail" | "outlook" | "icloud";
export type AccountStatus = "active" | "needs_reauth" | "disconnected";

export interface Account {
  id: string;
  userId: string;
  provider: Provider;
  email: string;
  displayName?: string;
  status: AccountStatus;
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
  tools: { name: string; description: string }[];
  reaches: { email: string; provider: Provider; status: AccountStatus }[];
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
