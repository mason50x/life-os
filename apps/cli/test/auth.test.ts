import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, pollForSession, startDeviceAuth } from "../src/lib/auth.js";

const grant = {
  deviceCode: "dc",
  userCode: "ABCD-EFGH",
  verificationUri: "https://auth.example/device",
  verificationUriComplete: "https://auth.example/device?user_code=ABCD-EFGH",
  intervalMs: 1,
  expiresAt: Date.now() + 60_000,
};

/** Queue of canned WorkOS responses, consumed one per poll. */
function mockWorkOs(responses: [number, unknown][]) {
  const fetchMock = vi.fn(async () => {
    const [status, body] = responses.shift() ?? [400, { error: "authorization_pending" }];
    return { ok: status < 400, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("startDeviceAuth", () => {
  it("reads WorkOS's snake_case response into the shape the UI uses", async () => {
    mockWorkOs([
      [200, {
        device_code: "dc", user_code: "WDJB-MJHT",
        verification_uri: "https://auth.example/device",
        verification_uri_complete: "https://auth.example/device?user_code=WDJB-MJHT",
        expires_in: 300, interval: 5,
      }],
    ]);
    const result = await startDeviceAuth("client_x");
    expect(result.userCode).toBe("WDJB-MJHT");
    expect(result.intervalMs).toBe(5000);
    expect(result.verificationUriComplete).toContain("user_code=WDJB-MJHT");
  });

  it("falls back to the plain verification URI when no complete one is sent", async () => {
    mockWorkOs([
      [200, { device_code: "dc", user_code: "A", verification_uri: "https://auth.example/device" }],
    ]);
    expect((await startDeviceAuth("c")).verificationUriComplete).toBe("https://auth.example/device");
  });
});

describe("pollForSession", () => {
  it("keeps waiting through authorization_pending, then returns the session", async () => {
    const fetchMock = mockWorkOs([
      [400, { error: "authorization_pending" }],
      [400, { error: "authorization_pending" }],
      [200, {
        access_token: "at", refresh_token: "rt", expires_in: 300,
        user: { id: "user_1", email: "me@example.com" },
      }],
    ]);
    const session = await pollForSession("client_x", grant);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(session).toMatchObject({ accessToken: "at", refreshToken: "rt", email: "me@example.com" });
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("backs off when told to slow down", async () => {
    mockWorkOs([
      [400, { error: "slow_down" }],
      [200, { access_token: "at", refresh_token: "rt", expires_in: 300 }],
    ]);
    // The interval grows by 5s; with a 1ms start the call still resolves, which
    // is what proves slow_down is a continue and not a failure.
    await expect(pollForSession("client_x", { ...grant, intervalMs: 1 })).resolves.toMatchObject({
      accessToken: "at",
    });
  }, 10_000);

  it("stops on access_denied with a message a person can act on", async () => {
    mockWorkOs([[400, { error: "access_denied" }]]);
    await expect(pollForSession("client_x", grant)).rejects.toThrow(/denied in the browser/);
  });

  it("stops once the grant has expired instead of polling forever", async () => {
    mockWorkOs([[400, { error: "expired_token" }]]);
    await expect(pollForSession("client_x", grant)).rejects.toThrow(AuthError);
  });

  it("gives up at the deadline", async () => {
    mockWorkOs([]);
    await expect(
      pollForSession("client_x", { ...grant, expiresAt: Date.now() - 1 }),
    ).rejects.toThrow(/timed out/i);
  });
});
