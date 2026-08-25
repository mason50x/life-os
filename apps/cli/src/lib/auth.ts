import { clearAuth, loadAuth, saveAuth, type StoredAuth } from "./credentials.js";

const WORKOS = "https://api.workos.com/user_management";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
/** Refresh this far ahead of expiry so a request never races the clock. */
const REFRESH_MARGIN_MS = 60_000;

export class AuthError extends Error {}

/** What a LifeOS instance says about itself. */
export interface InstanceConfig {
  appUrl: string;
  mcpUrl: string;
  authkitDomain: string;
  workosClientId: string;
}

export interface DeviceGrant {
  deviceCode: string;
  /** Shown to the user only when the browser couldn't be opened. */
  userCode: string;
  verificationUri: string;
  /** Same page with the code pre-filled — one click, nothing to type. */
  verificationUriComplete: string;
  intervalMs: number;
  expiresAt: number;
}

export interface Identity {
  userId: string;
  email?: string;
}

async function workos(path: string, body: unknown, form = false): Promise<Record<string, unknown>> {
  const res = await fetch(`${WORKOS}${path}`, {
    method: "POST",
    headers: { "content-type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form
      ? new URLSearchParams(body as Record<string, string>).toString()
      : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // WorkOS uses `error` for OAuth-shaped failures and `code` elsewhere; the
    // caller distinguishes pending-vs-fatal, so hand back both.
    const code = (json.error ?? json.code ?? `http_${res.status}`) as string;
    const detail = (json.error_description ?? json.message ?? "") as string;
    throw Object.assign(new AuthError(detail || code), { code });
  }
  return json;
}

/** Ask the instance who it is before signing in. Nothing here is hardcoded. */
export async function fetchInstanceConfig(apiUrl: string): Promise<InstanceConfig> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/cli/v1/config`);
  } catch (e) {
    throw new AuthError(`Couldn't reach ${apiUrl} — ${e instanceof Error ? e.message : e}`);
  }
  if (!res.ok) {
    throw new AuthError(
      `${apiUrl} doesn't look like a LifeOS instance (config returned ${res.status}).`,
    );
  }
  return (await res.json()) as InstanceConfig;
}

export async function startDeviceAuth(clientId: string): Promise<DeviceGrant> {
  const json = await workos("/authorize/device", { client_id: clientId }, true);
  return {
    deviceCode: String(json.device_code),
    userCode: String(json.user_code),
    verificationUri: String(json.verification_uri),
    verificationUriComplete: String(json.verification_uri_complete ?? json.verification_uri),
    intervalMs: (Number(json.interval) || 5) * 1000,
    expiresAt: Date.now() + (Number(json.expires_in) || 600) * 1000,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until the person confirms in the browser. RFC 8628 says to respect the
 * server's interval and to slow down when told, so the only two outcomes are a
 * session or a clear reason there isn't one.
 */
export async function pollForSession(
  clientId: string,
  grant: DeviceGrant,
  signal?: AbortSignal,
): Promise<StoredAuth> {
  let interval = grant.intervalMs;

  while (Date.now() < grant.expiresAt) {
    if (signal?.aborted) throw new AuthError("Sign-in cancelled.");
    await sleep(interval);

    try {
      return toStoredAuth(
        await workos("/authenticate", {
          client_id: clientId,
          grant_type: DEVICE_GRANT,
          device_code: grant.deviceCode,
        }),
      );
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "authorization_pending") continue;
      if (code === "slow_down") {
        interval += 5000;
        continue;
      }
      if (code === "access_denied") throw new AuthError("Sign-in was denied in the browser.");
      if (code === "expired_token") break;
      throw e;
    }
  }
  throw new AuthError("Sign-in timed out. Run `lifeos login` again.");
}

function toStoredAuth(json: Record<string, unknown>): StoredAuth {
  const user = json.user as { id?: string; email?: string } | undefined;
  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    // WorkOS access tokens are short-lived and don't always carry expires_in;
    // five minutes is well inside their real lifetime, so the worst case is an
    // extra refresh rather than a 401.
    expiresAt: Date.now() + (Number(json.expires_in) || 300) * 1000,
    userId: user?.id,
    email: user?.email,
  };
}

async function refresh(clientId: string, refreshToken: string): Promise<StoredAuth> {
  return toStoredAuth(
    await workos("/authenticate", {
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export interface Credential {
  /** Ready to send as `Authorization: Bearer`. */
  token: string;
  kind: "session" | "apiKey";
  identity?: Identity;
}

/**
 * The credential for an API call: a live access token, refreshed and re-stored
 * if it was about to expire, or the API key when that's how this machine signed
 * in. Null when nobody is signed in.
 */
let cached: { apiUrl: string; credential: Credential; until: number } | null = null;

export async function currentCredential(apiUrl: string): Promise<Credential | null> {
  // Reading the keychain spawns a subprocess, and `lifeos doctor` makes a
  // request per account. Hold the resolved credential for as long as it's
  // certainly valid rather than shelling out once per call.
  if (cached && cached.apiUrl === apiUrl && Date.now() < cached.until) return cached.credential;

  const stored = await loadAuth(apiUrl);
  if (!stored) return null;
  if (stored.apiKey) return remember(apiUrl, { token: stored.apiKey, kind: "apiKey" }, Infinity);
  if (!stored.refreshToken) return null;

  const identity = stored.userId ? { userId: stored.userId, email: stored.email } : undefined;
  if (stored.accessToken && (stored.expiresAt ?? 0) > Date.now() + REFRESH_MARGIN_MS) {
    return remember(apiUrl, { token: stored.accessToken, kind: "session", identity }, stored.expiresAt!);
  }

  const { workosClientId } = await fetchInstanceConfig(apiUrl);
  const renewed = await refresh(workosClientId, stored.refreshToken);
  // Keep the identity we already had: refresh responses don't always echo it.
  const merged = { ...stored, ...renewed, email: renewed.email ?? stored.email };
  await saveAuth(apiUrl, merged);
  return remember(
    apiUrl,
    {
      token: merged.accessToken!,
      kind: "session",
      identity: merged.userId ? { userId: merged.userId, email: merged.email } : undefined,
    },
    merged.expiresAt!,
  );
}

/** Cache until the token's own expiry, minus the margin a refresh needs. */
function remember(apiUrl: string, credential: Credential, expiresAt: number): Credential {
  cached = { apiUrl, credential, until: expiresAt - REFRESH_MARGIN_MS };
  return credential;
}

export async function signIn(apiUrl: string, auth: StoredAuth): Promise<void> {
  cached = null;
  await saveAuth(apiUrl, auth);
}

export async function signOut(apiUrl: string): Promise<void> {
  cached = null;
  await clearAuth(apiUrl);
}
