import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { Hint, ScreenTitle, Spinner } from "../ui/components.js";
import { theme } from "../ui/theme.js";
import { backendName, type Backend } from "../lib/credentials.js";
import { detectInstaller, updateCommand } from "../lib/update.js";
import type { ScreenProps } from "./types.js";

export const SETTINGS_KEYS = "o sign out";

export function Settings({
  client,
  focused,
  version,
  latest,
  identity,
  onSignOut,
  updating,
  updateLog,
}: ScreenProps & {
  version: string;
  latest: string | null;
  identity?: string;
  onSignOut: () => void;
  updating: boolean;
  updateLog: string[];
}) {
  const [backend, setBackend] = useState<Backend | null>(null);
  // An API-key sign-in carries no email, so fall back to the user id the
  // instance reports rather than showing a dash.
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void backendName().then(setBackend);
  }, []);

  useEffect(() => {
    if (identity) return;
    void client
      .me()
      .then((me) => setUserId(me.userId))
      .catch(() => {});
  }, [client, identity]);

  useInput(
    (input) => {
      if (input === "o") onSignOut();
    },
    { isActive: focused && !updating },
  );

  const [cmd, args] = updateCommand();

  return (
    <Box flexDirection="column">
      <ScreenTitle title="Settings" />

      <Row label="signed in as" value={identity ?? userId ?? "—"} />
      <Row label="instance" value={client.apiUrl} />
      <Row label="credentials" value={backend ?? "checking…"} />
      <Row label="version" value={version} />
      <Row
        label="update"
        value={latest ? `${latest} available — press u` : "up to date"}
        color={latest ? theme.accent : undefined}
      />
      <Row label="installed by" value={detectInstaller()} />

      {updating ? (
        <Box flexDirection="column" marginTop={1}>
          <Spinner label={`${cmd} ${args.join(" ")}`} />
          {updateLog.slice(-6).map((line, i) => (
            <Text key={i} color={theme.muted} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Hint>
            Set LIFEOS_API_URL, or pass --api-url to `lifeos login`, to point at another instance.
          </Hint>
        </Box>
      )}
    </Box>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Box width={16}>
        <Text color={theme.muted}>{label}</Text>
      </Box>
      <Text color={color} wrap="truncate-end">
        {value}
      </Text>
    </Box>
  );
}
