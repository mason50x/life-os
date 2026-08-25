import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { Hint, Spinner } from "../ui/components.js";
import { theme } from "../ui/theme.js";
import { fetchInstanceConfig, pollForSession, signIn, startDeviceAuth, type DeviceGrant } from "../lib/auth.js";
import { canOpenBrowser, openBrowser } from "../lib/platform.js";

type State =
  | { name: "starting" }
  | { name: "waiting"; grant: DeviceGrant; opened: boolean }
  | { name: "error"; message: string };

/**
 * Sign-in. The device flow's `verification_uri_complete` already carries the
 * code, so opening it means the person confirms and nothing gets typed. When
 * there's no browser to open — SSH, a container — the same flow degrades to a
 * URL and a short code without a second code path.
 */
export function Login({ apiUrl, onDone }: { apiUrl: string; onDone: () => void }) {
  const [state, setState] = useState<State>({ name: "starting" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { workosClientId } = await fetchInstanceConfig(apiUrl);
        const grant = await startDeviceAuth(workosClientId);
        if (cancelled) return;

        const opened = canOpenBrowser() && (await openBrowser(grant.verificationUriComplete));
        setState({ name: "waiting", grant, opened });

        const session = await pollForSession(workosClientId, grant);
        if (cancelled) return;
        await signIn(apiUrl, session);
        onDone();
      } catch (e) {
        if (!cancelled) {
          setState({ name: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, onDone]);

  if (state.name === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.bad}>✗ {state.message}</Text>
        <Box marginTop={1}>
          <Hint>{apiUrl} · ctrl-c to quit</Hint>
        </Box>
      </Box>
    );
  }

  if (state.name === "starting") {
    return (
      <Box padding={1}>
        <Spinner label={`reaching ${apiUrl}`} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        LifeOS
      </Text>

      {state.opened ? (
        <Box marginTop={1}>
          <Text>Your browser is open — confirm the sign-in there.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text>Open this on any device:</Text>
          <Box marginTop={1}>
            <Text color={theme.accent}>{state.grant.verificationUri}</Text>
          </Box>
          <Box marginTop={1}>
            <Text>and enter the code </Text>
            <Text bold color={theme.accent}>
              {state.grant.userCode}
            </Text>
          </Box>
        </Box>
      )}

      {state.opened ? (
        <Box marginTop={1}>
          <Hint>
            Didn&apos;t open? {state.grant.verificationUri} · code {state.grant.userCode}
          </Hint>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Spinner label="waiting for confirmation" />
      </Box>
    </Box>
  );
}
