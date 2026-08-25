import { currentCredential } from "./auth.js";
import type { Account, AccountCheck, ApiKey, McpInfo, Me, Provider } from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class NotSignedInError extends ApiError {
  constructor() {
    super("Not signed in. Run `lifeos login`.", 401);
  }
}

/**
 * Everything the CLI can do against a LifeOS instance. Deliberately the same
 * surface the dashboard has, so the two can't drift into different products.
 */
export class LifeOsClient {
  constructor(readonly apiUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const credential = await currentCredential(this.apiUrl);
    if (!credential) throw new NotSignedInError();

    const res = await fetch(`${this.apiUrl}/api/cli/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${credential.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (res.status === 401) throw new NotSignedInError();
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status}).`, res.status);
    return json as T;
  }

  me(): Promise<Me> {
    return this.request("GET", "/me");
  }

  async accounts(): Promise<Account[]> {
    return (await this.request<{ accounts: Account[] }>("GET", "/accounts")).accounts;
  }

  removeAccount(id: string): Promise<void> {
    return this.request("DELETE", `/accounts/${encodeURIComponent(id)}`);
  }

  checkAccount(id: string): Promise<AccountCheck> {
    return this.request("POST", `/accounts/${encodeURIComponent(id)}/check`);
  }

  connectIcloud(email: string, password: string, sendAs: string[] = []): Promise<{ addresses: string[] }> {
    return this.request("POST", "/accounts/icloud", { email, password, sendAs });
  }

  /** The browser URL for a Gmail/Outlook connect; valid for ten minutes. */
  connectSession(provider: Exclude<Provider, "icloud">): Promise<{ url: string; expiresAt: number }> {
    return this.request("POST", "/connect/session", { provider });
  }

  async keys(): Promise<ApiKey[]> {
    return (await this.request<{ keys: ApiKey[] }>("GET", "/keys")).keys;
  }

  /** The raw key comes back once and is never retrievable again. */
  createKey(name: string): Promise<{ key: string }> {
    return this.request("POST", "/keys", { name });
  }

  revokeKey(id: string): Promise<void> {
    return this.request("DELETE", `/keys/${encodeURIComponent(id)}`);
  }

  mcp(): Promise<McpInfo> {
    return this.request("GET", "/mcp");
  }

  /**
   * An unauthenticated probe of the MCP endpoint. A healthy one refuses with
   * 401 and a WWW-Authenticate header pointing at the OAuth metadata — a 200 or
   * a bare 401 means discovery is misconfigured and MCP clients won't connect.
   */
  async probeMcp(url: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(url, { method: "POST", headers: { accept: "application/json" } });
      if (res.status !== 401) {
        return { ok: false, detail: `expected 401 challenge, got ${res.status}` };
      }
      const challenge = res.headers.get("www-authenticate");
      return challenge
        ? { ok: true, detail: "401 challenge advertises OAuth metadata" }
        : { ok: false, detail: "401 without a WWW-Authenticate header" };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}
