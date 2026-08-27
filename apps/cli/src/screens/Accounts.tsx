import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { Feedback, Field, Hint, ScreenTitle, Spinner, StatusDot, StatusText, TypeToConfirm } from "../ui/components.js";
import { windowed } from "../ui/hooks.js";
import { formatDate, theme } from "../ui/theme.js";
import { openBrowser } from "../lib/platform.js";
import {
  MAX_ACCOUNT_NICKNAME,
  PROVIDER_CAPABILITIES,
  PROVIDER_LABEL,
  accountNames,
  capabilityLabel,
  defaultAccountName,
  type Account,
  type Provider,
} from "../lib/types.js";
import type { ScreenProps } from "./types.js";

export const ACCOUNTS_KEYS =
  "↑↓ move · a add · n rename · e calendar · r reconnect · c check · d disconnect";

type Mode =
  | { name: "list" }
  | { name: "picker"; index: number; reconnect?: Account }
  | { name: "icloud"; field: number; email: string; password: string; sendAs: string; busy?: boolean }
  | { name: "browser"; provider: Provider; url: string; opened: boolean }
  | { name: "rename"; account: Account; value: string; busy?: boolean }
  | { name: "confirm"; account: Account };

const PROVIDERS: Provider[] = ["gmail", "outlook", "icloud"];
/** Give up waiting on the browser at the same point the handoff token expires. */
const CONNECT_TIMEOUT_MS = 10 * 60 * 1000;

export function Accounts({ client, live, focused, height, onChanged }: ScreenProps) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>({ name: "list" });
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const watching = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await client.accounts();
      setAccounts(next);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
      setAccounts([]);
      return [];
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: the same list the dashboard subscribes to, over the instance's
  // Convex deployment — a rename in the browser lands here as it happens. The
  // HTTP load above still runs first, so the screen is never blank while the
  // WebSocket authenticates, and it is the whole story when live is null.
  useEffect(() => {
    if (!live) return;
    return live.onAccounts((next) => {
      setAccounts(next);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    });
  }, [live]);

  const stopWatching = useCallback(() => {
    if (watching.current) clearInterval(watching.current);
    watching.current = null;
  }, []);
  useEffect(() => stopWatching, [stopWatching]);

  /**
   * After handing the browser off, watch for the account to appear rather than
   * asking the person to come back and press refresh — the terminal already
   * knows what it's waiting for.
   */
  const watchForConnect = useCallback(
    (before: Map<string, string>) => {
      const startedAt = Date.now();
      stopWatching();
      watching.current = setInterval(async () => {
        if (Date.now() - startedAt > CONNECT_TIMEOUT_MS) {
          stopWatching();
          setMode({ name: "list" });
          setMessage({ text: "Timed out waiting for the browser.", bad: true });
          return;
        }
        const next = await client.accounts().catch(() => null);
        if (!next) return;
        // A new inbox, or an existing one that just came back to life — the
        // reconnect case changes nothing but the status, so counting rows
        // would miss it entirely.
        const fresh = next.find(
          (a) => !before.has(a.id) || (a.status === "active" && before.get(a.id) !== "active"),
        );
        if (fresh) {
          stopWatching();
          setAccounts(next);
          setMode({ name: "list" });
          setMessage({ text: `Connected ${fresh.email}.` });
          onChanged?.();
        }
      }, 2000);
    },
    [client, onChanged, stopWatching],
  );

  const startBrowserConnect = useCallback(
    async (provider: Exclude<Provider, "icloud">) => {
      setMessage(null);
      try {
        const { url } = await client.connectSession(provider);
        const opened = await openBrowser(url);
        setMode({ name: "browser", provider, url, opened });
        watchForConnect(new Map((accounts ?? []).map((a) => [a.id, a.status])));
      } catch (e) {
        setMode({ name: "list" });
        setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
      }
    },
    [accounts, client, watchForConnect],
  );

  const submitIcloud = useCallback(async () => {
    if (mode.name !== "icloud") return;
    setMode({ ...mode, busy: true });
    try {
      const sendAs = mode.sendAs.split(/[\s,;]+/).filter(Boolean);
      const { addresses } = await client.connectIcloud(mode.email, mode.password, sendAs);
      setMode({ name: "list" });
      setMessage({ text: `Connected ${addresses.join(", ")}.` });
      await load();
      onChanged?.();
    } catch (e) {
      setMode({ ...mode, busy: false });
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
  }, [client, load, mode, onChanged]);

  const submitRename = useCallback(async () => {
    if (mode.name !== "rename") return;
    setMode({ ...mode, busy: true });
    try {
      await client.renameAccount(mode.account.id, mode.value);
      const name = mode.value.trim() || defaultAccountName(mode.account.email);
      setMode({ name: "list" });
      setMessage({ text: `${mode.account.email} is now ${name}.` });
      await load();
      onChanged?.();
    } catch (e) {
      setMode({ ...mode, busy: false });
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
  }, [client, load, mode, onChanged]);

  const runCheck = useCallback(
    async (account: Account) => {
      setChecking(true);
      setMessage(null);
      const result = await client.checkAccount(account.id).catch((e: unknown) => ({
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        ms: 0,
      }));
      setChecking(false);
      setMessage({
        text: `${account.email} — ${result.detail}${result.ok ? ` (${result.ms}ms)` : ""}`,
        bad: !result.ok,
      });
      await load();
    },
    [client, load],
  );

  /**
   * Add calendar to an account already connected for mail. The server proves
   * the stored credential reaches the calendar and records it — an iCloud
   * app-specific password needs no extra grant to speak CalDAV, and a Google
   * token works whenever its consent screen included calendar. Nobody is asked
   * for anything unless that fails, which is what makes this a keypress and not
   * a form.
   */
  const addCalendar = useCallback(
    async (account: Account) => {
      setEnabling(true);
      setMessage(null);
      try {
        const { enabled } = await client.enableCalendar(account.id);
        setMessage({
          text: enabled.length
            ? `Calendar on for ${enabled.join(", ")}.`
            : `${account.email} already had calendar.`,
        });
        await load();
        onChanged?.();
      } catch (e) {
        setMessage({
          text: `${e instanceof Error ? e.message : String(e)} Press r to reconnect it.`,
          bad: true,
        });
      } finally {
        setEnabling(false);
      }
    },
    [client, load, onChanged],
  );

  const selected = accounts?.[index];
  /** Mail-only, on a provider that has calendars: `e` has something to do. */
  const canAddCalendar =
    !!selected &&
    selected.status === "active" &&
    !selected.capabilities?.includes("calendar") &&
    // An address whose calendar lives on a sibling has nothing of its own to
    // turn on — enabling happens once, on the account that owns it.
    !selected.calendarOf &&
    PROVIDER_CAPABILITIES[selected.provider].includes("calendar");

  useInput(
    (input, key) => {
      if (mode.name === "list") {
        if (key.upArrow || input === "k") setIndex((i) => Math.max(0, i - 1));
        if (key.downArrow || input === "j") setIndex((i) => Math.min((accounts?.length ?? 1) - 1, i + 1));
        if (input === "a") setMode({ name: "picker", index: 0 });
        if (input === "r" && selected) {
          setMode({ name: "picker", index: PROVIDERS.indexOf(selected.provider), reconnect: selected });
        }
        if (input === "n" && selected) {
          setMode({ name: "rename", account: selected, value: selected.nickname ?? "" });
        }
        if (input === "e" && selected && canAddCalendar && !enabling) void addCalendar(selected);
        if (input === "c" && selected) void runCheck(selected);
        if (input === "d" && selected) setMode({ name: "confirm", account: selected });
        return;
      }

      if (mode.name === "picker") {
        if (key.escape) return setMode({ name: "list" });
        if (key.upArrow) return setMode({ ...mode, index: Math.max(0, mode.index - 1) });
        if (key.downArrow) {
          return setMode({ ...mode, index: Math.min(PROVIDERS.length - 1, mode.index + 1) });
        }
        if (key.return) {
          const provider = PROVIDERS[mode.index]!;
          if (provider === "icloud") {
            return setMode({
              name: "icloud",
              field: 0,
              email: mode.reconnect?.provider === "icloud" ? mode.reconnect.email : "",
              password: "",
              sendAs: "",
            });
          }
          void startBrowserConnect(provider);
        }
        return;
      }

      if (mode.name === "icloud" && !mode.busy) {
        if (key.escape) return setMode({ name: "list" });
        if (key.tab || key.downArrow) return setMode({ ...mode, field: (mode.field + 1) % 3 });
        if (key.upArrow) return setMode({ ...mode, field: (mode.field + 2) % 3 });
        return;
      }

      if (mode.name === "rename") {
        if (key.escape && !mode.busy) setMode({ name: "list" });
        return;
      }

      if (mode.name === "browser") {
        if (key.escape) {
          stopWatching();
          setMode({ name: "list" });
        }
        return;
      }
    },
    { isActive: focused && mode.name !== "confirm" },
  );

  if (accounts === null) {
    return (
      <Box>
        <Spinner label="loading accounts" />
      </Box>
    );
  }

  if (mode.name === "picker") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title={mode.reconnect ? "Reconnect" : "Add an account"} />
        {PROVIDERS.map((p, i) => (
          <Box key={p}>
            <Text color={i === mode.index ? theme.accent : undefined}>
              {i === mode.index ? "❯ " : "  "}
              {PROVIDER_LABEL[p]}
            </Text>
            <Hint>
              {"  "}
              {PROVIDER_CAPABILITIES[p].includes("calendar") ? "Mail · Calendar" : "Mail"}
              {p === "icloud" ? " · app-specific password, right here" : " · opens your browser"}
            </Hint>
          </Box>
        ))}
        <Box marginTop={1}>
          <Hint>↑↓ choose · ⏎ start · esc cancel</Hint>
        </Box>
      </Box>
    );
  }

  if (mode.name === "icloud") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Connect iCloud" note="verified against Apple before it's saved" />
        <Field
          label="email"
          value={mode.email}
          onChange={(email) => setMode({ ...mode, email })}
          onSubmit={() => setMode({ ...mode, field: 1 })}
          focused={mode.field === 0 && !mode.busy}
          placeholder="you@icloud.com"
        />
        <Field
          label="password"
          value={mode.password}
          onChange={(password) => setMode({ ...mode, password })}
          onSubmit={() => setMode({ ...mode, field: 2 })}
          focused={mode.field === 1 && !mode.busy}
          mask
          placeholder="xxxx-xxxx-xxxx-xxxx"
        />
        <Field
          label="send-as"
          value={mode.sendAs}
          onChange={(sendAs) => setMode({ ...mode, sendAs })}
          onSubmit={submitIcloud}
          focused={mode.field === 2 && !mode.busy}
          placeholder="optional aliases, space separated"
        />
        <Box marginTop={1}>
          {mode.busy ? (
            <Spinner label="asking Apple to verify it" />
          ) : (
            <Hint>
              tab next · ⏎ on the last field connects · esc cancel — it&apos;s an app-specific
              password from account.apple.com, not your Apple Account password
            </Hint>
          )}
        </Box>
        <Feedback message={message} />
      </Box>
    );
  }

  if (mode.name === "rename") {
    const fallback = defaultAccountName(mode.account.email);
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Rename" note={mode.account.email} />
        <Field
          label="name"
          value={mode.value}
          onChange={(value) => setMode({ ...mode, value: value.slice(0, MAX_ACCOUNT_NICKNAME) })}
          onSubmit={submitRename}
          focused={!mode.busy}
          placeholder={fallback}
        />
        <Box marginTop={1}>
          {mode.busy ? (
            <Spinner label="saving" />
          ) : (
            <Hint>{`⏎ save · esc cancel — leave it empty to go back to "${fallback}"`}</Hint>
          )}
        </Box>
        <Feedback message={message} />
      </Box>
    );
  }

  if (mode.name === "browser") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title={`Connect ${PROVIDER_LABEL[mode.provider]}`} />
        {mode.opened ? (
          <Text>Your browser is open. Approve the permission prompt there.</Text>
        ) : (
          <Box flexDirection="column">
            <Text>Open this in a browser to finish:</Text>
            <Box marginTop={1}>
              <Text color={theme.accent}>{mode.url}</Text>
            </Box>
          </Box>
        )}
        <Box marginTop={1}>
          <Spinner label="waiting for the inbox to appear" />
        </Box>
        <Box marginTop={1}>
          <Hint>esc to stop waiting</Hint>
        </Box>
      </Box>
    );
  }

  if (mode.name === "confirm") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Disconnect" />
        <Text>
          LifeOS forgets {mode.account.email} and its tokens. Nothing in the mailbox changes.
        </Text>
        <TypeToConfirm
          prompt="This can't be undone."
          expected={mode.account.email}
          onCancel={() => setMode({ name: "list" })}
          onConfirm={async () => {
            setMode({ name: "list" });
            try {
              await client.removeAccount(mode.account.id);
              setMessage({ text: `Disconnected ${mode.account.email}.` });
              await load();
              onChanged?.();
            } catch (e) {
              setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
            }
          }}
        />
      </Box>
    );
  }

  if (accounts.length === 0) {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Inboxes" />
        <Text color={theme.muted}>Nothing connected yet.</Text>
        <Box marginTop={1}>
          <Hint>press a to add one</Hint>
        </Box>
        <Feedback message={message} />
      </Box>
    );
  }

  const names = accountNames(accounts);
  // Two lines per account plus the blank between them.
  const perRow = 3;
  const { slice, start } = windowed(accounts, index, Math.max(1, Math.floor((height - 3) / perRow)));

  return (
    <Box flexDirection="column">
      <ScreenTitle
        title="Accounts"
        note={`${accounts.length} connected${start > 0 ? ` · showing ${start + 1}–${start + slice.length}` : ""}`}
      />
      {slice.map((account) => {
        const isSelected = accounts[index]?.id === account.id;
        const name = names.get(account.email) ?? account.email;
        return (
          <Box key={account.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? theme.accent : undefined}>{isSelected ? "❯ " : "  "}</Text>
              <Text bold={isSelected}>{name}</Text>
              {/* The address only earns a spot here when the name isn't already it. */}
              {name !== account.email && <Text color={theme.muted}>{`  ${account.email}`}</Text>}
            </Box>
            <Box paddingLeft={2}>
              <StatusDot status={account.status} />
              <Text color={theme.muted}> </Text>
              <StatusText status={account.status} />
              <Text color={theme.muted}>
                {" · "}
                {PROVIDER_LABEL[account.provider]}
                {" · "}
                {capabilityLabel(account)}
                {" · since "}
                {formatDate(account.connectedAt)}
              </Text>
            </Box>
            {/* A mail-only grant on a provider that has calendars. The
                credential on file usually reaches the calendar already, so this
                is one key and no typing — see addCalendar. */}
            {account.status === "active" &&
              !account.capabilities?.includes("calendar") &&
              !account.calendarOf &&
              PROVIDER_CAPABILITIES[account.provider].includes("calendar") && (
                <Box paddingLeft={2}>
                  <Hint>press e to add calendar — no password, it reuses the sign-in you gave</Hint>
                </Box>
              )}
          </Box>
        );
      })}
      {checking || enabling ? (
        <Spinner label={checking ? "checking" : "asking the provider for the calendar"} />
      ) : (
        <Feedback message={message} />
      )}
    </Box>
  );
}
