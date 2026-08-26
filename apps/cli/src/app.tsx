import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "./ui/Layout.js";
import { Hint, Spinner } from "./ui/components.js";
import { useTerminalSize } from "./ui/hooks.js";
import { theme } from "./ui/theme.js";
import type { NavItem } from "./ui/Sidebar.js";
import { Accounts, ACCOUNTS_KEYS } from "./screens/Accounts.js";
import { Doctor, DOCTOR_KEYS } from "./screens/Doctor.js";
import { Keys, KEYS_KEYS } from "./screens/Keys.js";
import { Login } from "./screens/Login.js";
import { Mcp, MCP_KEYS } from "./screens/Mcp.js";
import { Settings, SETTINGS_KEYS } from "./screens/Settings.js";
import { LifeOsClient } from "./lib/api.js";
import { currentCredential, signOut, type Identity } from "./lib/auth.js";
import { checkForUpdate, runUpdate } from "./lib/update.js";

const NAV = [
  { key: "accounts", label: "Accounts", keys: ACCOUNTS_KEYS },
  { key: "mcp", label: "MCP", keys: MCP_KEYS },
  { key: "keys", label: "Keys", keys: KEYS_KEYS },
  { key: "doctor", label: "Doctor", keys: DOCTOR_KEYS },
  { key: "settings", label: "Settings", keys: SETTINGS_KEYS },
] as const;

type Screen = (typeof NAV)[number]["key"];

/** Chrome the layout draws: header, footer, and the content pane's padding. */
const CHROME_ROWS = 6;

export function App({ apiUrl, version }: { apiUrl: string; version: string }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [identity, setIdentity] = useState<Identity | undefined>();
  const [screen, setScreen] = useState<Screen>("accounts");
  const [navFocused, setNavFocused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Stable across renders: screens key their data loading off this identity.
  const client = useMemo(() => new LifeOsClient(apiUrl), [apiUrl]);
  // Only re-reads the session — screens reload their own data after a change,
  // and remounting them here would throw away whatever they are showing (the
  // one-time reveal of a freshly minted API key, most visibly).
  const onChanged = useCallback(() => setReloadKey((k) => k + 1), []);

  const refreshIdentity = useCallback(async () => {
    const credential = await currentCredential(apiUrl).catch(() => null);
    setSignedIn(Boolean(credential));
    setIdentity(credential?.identity);
  }, [apiUrl]);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity, reloadKey]);

  useEffect(() => {
    void checkForUpdate(version).then(setLatest);
  }, [version]);

  const update = useCallback(async () => {
    if (updating || !latest) return;
    setUpdating(true);
    setScreen("settings");
    setUpdateLog([]);
    try {
      await runUpdate((line) => setUpdateLog((log) => [...log, line]));
      // The binary on disk is now a different one; re-exec rather than keep
      // running the version that was just replaced.
      setUpdateLog((log) => [...log, "Updated. Start `lifeos` again."]);
      setLatest(null);
    } catch (e) {
      setUpdateLog((log) => [...log, e instanceof Error ? e.message : String(e)]);
    }
    setUpdating(false);
  }, [latest, updating]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();
    if (helpOpen) {
      setHelpOpen(false);
      return;
    }
    if (input === "?") return setHelpOpen(true);
    if (input === "u" && latest) return void update();

    if (key.tab) {
      return setNavFocused((f) => !f);
    }
    if (navFocused) {
      const at = NAV.findIndex((n) => n.key === screen);
      if (key.upArrow) return setScreen(NAV[Math.max(0, at - 1)]!.key);
      if (key.downArrow) return setScreen(NAV[Math.min(NAV.length - 1, at + 1)]!.key);
      if (key.return || key.rightArrow) return setNavFocused(false);
      if (input === "q") return exit();
      return;
    }
    if (key.escape || key.leftArrow) setNavFocused(true);
  });

  if (signedIn === null) {
    return (
      <Box padding={1}>
        <Spinner label="checking your session" />
      </Box>
    );
  }

  if (!signedIn) {
    return <Login apiUrl={apiUrl} onDone={() => setReloadKey((k) => k + 1)} />;
  }

  const nav: NavItem[] = NAV.map((n) => ({ key: n.key, label: n.label }));
  const contentHeight = Math.max(4, rows - CHROME_ROWS);
  const screenProps = {
    client,
    focused: !navFocused && !helpOpen,
    height: contentHeight,
    onChanged,
  };

  return (
    <Layout
      columns={columns}
      rows={rows}
      nav={nav}
      current={screen}
      navFocused={navFocused}
      instance={apiUrl.replace(/^https?:\/\//, "")}
      identity={identity?.email}
      updateAvailable={latest}
      keys={
        navFocused
          ? "↑↓ move · ⏎ open · q quit"
          : (NAV.find((n) => n.key === screen)?.keys ?? "") + " · esc back"
      }
    >
      {helpOpen ? (
        <Help />
      ) : screen === "accounts" ? (
        <Accounts {...screenProps} />
      ) : screen === "mcp" ? (
        <Mcp {...screenProps} />
      ) : screen === "keys" ? (
        <Keys {...screenProps} />
      ) : screen === "doctor" ? (
        <Doctor {...screenProps} />
      ) : (
        <Settings
          {...screenProps}
          version={version}
          latest={latest}
          identity={identity?.email}
          updating={updating}
          updateLog={updateLog}
          onSignOut={async () => {
            await signOut(apiUrl);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </Layout>
  );
}

function Help() {
  const rows: [string, string][] = [
    ["tab", "move between the rail and the pane"],
    ["↑ ↓", "move within whichever has focus"],
    ["esc", "back to the rail"],
    ["a", "add an inbox (Accounts)"],
    ["r", "reconnect the selected inbox · re-run checks (Doctor)"],
    ["c", "check the selected inbox · copy (MCP, revealed key)"],
    ["d", "disconnect the selected inbox"],
    ["n / x", "new / revoke an API key"],
    ["i", "install into Claude Code (MCP)"],
    ["o", "sign out (Settings)"],
    ["u", "install an available update"],
    ["q", "quit"],
  ];
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Keys</Text>
      </Box>
      {rows.map(([k, what]) => (
        <Box key={k}>
          <Box width={8}>
            <Text color={theme.accent}>{k}</Text>
          </Box>
          <Text>{what}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Hint>any key to close</Hint>
      </Box>
    </Box>
  );
}
