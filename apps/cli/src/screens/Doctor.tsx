import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { Hint, ScreenTitle, Spinner } from "../ui/components.js";
import { theme } from "../ui/theme.js";
import { PROVIDER_LABEL, capabilityLabel } from "../lib/types.js";
import type { ScreenProps } from "./types.js";

export const DOCTOR_KEYS = "r run again";

interface Check {
  label: string;
  note?: string;
  state: "pending" | "ok" | "bad";
  detail?: string;
}

/**
 * A stored `status: "active"` only means nobody has failed yet. This makes the
 * calls: refresh every token, reach every provider, and confirm the MCP
 * endpoint still challenges an anonymous request the way clients expect.
 */
export function Doctor({ client, focused }: ScreenProps) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setChecks([]);

    const update = (label: string, patch: Partial<Check>) =>
      setChecks((prev) => prev.map((c) => (c.label === label ? { ...c, ...patch } : c)));

    let accounts;
    try {
      accounts = await client.accounts();
    } catch (e) {
      setChecks([
        {
          label: "LifeOS API",
          state: "bad",
          detail: e instanceof Error ? e.message : String(e),
        },
      ]);
      setRunning(false);
      return;
    }

    const mcp = await client.mcp().catch(() => null);
    const initial: Check[] = [
      ...accounts.map((a) => ({
        label: a.email,
        note: `${PROVIDER_LABEL[a.provider]} · ${capabilityLabel(a)}`,
        state: "pending" as const,
      })),
      { label: "MCP endpoint", note: mcp?.url, state: "pending" as const },
    ];
    setChecks(initial);

    // Concurrently: one slow mailbox shouldn't hold up the rest of the report.
    await Promise.all([
      ...accounts.map(async (a) => {
        const result = await client.checkAccount(a.id).catch((e: unknown) => ({
          ok: false,
          ms: 0,
          detail: e instanceof Error ? e.message : String(e),
        }));
        update(a.email, {
          state: result.ok ? "ok" : "bad",
          detail: result.ok ? `${result.detail} · ${result.ms}ms` : result.detail,
        });
      }),
      (async () => {
        if (!mcp) return update("MCP endpoint", { state: "bad", detail: "couldn't read the URL" });
        const probe = await client.probeMcp(mcp.url);
        update("MCP endpoint", { state: probe.ok ? "ok" : "bad", detail: probe.detail });
      })(),
    ]);

    setRunning(false);
  }, [client]);

  useEffect(() => {
    void run();
  }, [run]);

  useInput(
    (input) => {
      if (input === "r" && !running) void run();
    },
    { isActive: focused },
  );

  const failed = checks.filter((c) => c.state === "bad").length;
  const note = running
    ? undefined
    : failed === 0
      ? "all clear"
      : `${failed} need${failed === 1 ? "s" : ""} attention`;

  return (
    <Box flexDirection="column">
      <ScreenTitle title="Doctor" note={note} />
      {checks.length === 0 ? (
        <Spinner label="starting" />
      ) : (
        checks.map((c) => (
          <Box key={c.label} flexDirection="column" marginBottom={1}>
            <Box>
              {c.state === "pending" ? (
                <Spinner />
              ) : (
                <Text color={c.state === "ok" ? theme.ok : theme.bad}>
                  {c.state === "ok" ? "✓" : "✗"}
                </Text>
              )}
              <Text> {c.label}</Text>
              {c.note ? <Hint> {c.note}</Hint> : null}
            </Box>
            {c.detail ? (
              <Box paddingLeft={2}>
                <Text color={c.state === "bad" ? theme.bad : theme.muted} wrap="truncate-end">
                  {c.detail}
                </Text>
              </Box>
            ) : null}
          </Box>
        ))
      )}
      {failed > 0 && !running ? (
        <Hint>A failing inbox usually just needs reconnecting — Accounts, then r.</Hint>
      ) : null}
    </Box>
  );
}
