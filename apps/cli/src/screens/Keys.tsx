import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import TextInput from "ink-text-input";
import { Feedback, Hint, ScreenTitle, Spinner, TypeToConfirm } from "../ui/components.js";
import { windowed } from "../ui/hooks.js";
import { formatDate, theme } from "../ui/theme.js";
import { copyToClipboard } from "../lib/platform.js";
import type { ApiKey } from "../lib/types.js";
import type { ScreenProps } from "./types.js";

export const KEYS_KEYS = "↑↓ move · n new · x revoke";

type Mode =
  | { name: "list" }
  | { name: "naming"; value: string }
  | { name: "revealed"; key: string }
  | { name: "confirm"; key: ApiKey };

export function Keys({ client, focused, height, onChanged }: ScreenProps) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>({ name: "list" });
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await client.keys();
      setKeys(next);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    } catch (e) {
      setKeys([]);
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (name: string) => {
      try {
        const { key } = await client.createKey(name);
        setMode({ name: "revealed", key });
        await load();
        onChanged?.();
      } catch (e) {
        setMode({ name: "list" });
        setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
      }
    },
    [client, load, onChanged],
  );

  const selected = keys?.[index];

  useInput(
    (input, key) => {
      if (mode.name === "list") {
        if (key.upArrow || input === "k") setIndex((i) => Math.max(0, i - 1));
        if (key.downArrow || input === "j") setIndex((i) => Math.min((keys?.length ?? 1) - 1, i + 1));
        if (input === "n") setMode({ name: "naming", value: "" });
        if (input === "x" && selected) setMode({ name: "confirm", key: selected });
        return;
      }
      if (mode.name === "revealed") {
        if (input === "c") {
          void copyToClipboard(mode.key).then((copied) =>
            setMessage(
              copied ? { text: "Key copied." } : { text: "No clipboard command.", bad: true },
            ),
          );
        }
        if (key.escape || key.return) {
          setMode({ name: "list" });
          setMessage(null);
        }
        return;
      }
      if (mode.name === "naming" && key.escape) setMode({ name: "list" });
    },
    { isActive: focused && mode.name !== "confirm" },
  );

  if (keys === null) return <Spinner label="loading keys" />;

  if (mode.name === "naming") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="New API key" />
        <Box>
          <Text color={theme.muted}>name ❯ </Text>
          <TextInput
            value={mode.value}
            onChange={(value) => setMode({ name: "naming", value })}
            onSubmit={() => void create(mode.value)}
            placeholder="CLI key"
          />
        </Box>
        <Box marginTop={1}>
          <Hint>⏎ create · esc cancel</Hint>
        </Box>
      </Box>
    );
  }

  if (mode.name === "revealed") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Copy it now" note="shown once" />
        <Box borderStyle="round" borderColor={theme.accent} paddingX={1}>
          <Text color={theme.accent}>{mode.key}</Text>
        </Box>
        <Box marginTop={1}>
          <Hint>
            Only the hash is stored — there is no way to show this again. c copy · ⏎ done
          </Hint>
        </Box>
        <Feedback message={message} />
      </Box>
    );
  }

  if (mode.name === "confirm") {
    return (
      <Box flexDirection="column">
        <ScreenTitle title="Revoke key" />
        <Text>Anything still using {mode.key.prefix}… stops working immediately.</Text>
        <TypeToConfirm
          prompt="This can't be undone."
          expected={mode.key.name}
          onCancel={() => setMode({ name: "list" })}
          onConfirm={async () => {
            setMode({ name: "list" });
            try {
              await client.revokeKey(mode.key._id);
              setMessage({ text: `Revoked ${mode.key.name}.` });
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

  const { slice } = windowed(keys, index, Math.max(1, height - 5));

  return (
    <Box flexDirection="column">
      <ScreenTitle title="API keys" note={keys.length ? `${keys.length}` : undefined} />
      {keys.length === 0 ? (
        <Box flexDirection="column">
          <Text color={theme.muted}>None — and you probably don&apos;t need one.</Text>
          <Box marginTop={1}>
            <Hint>
              This CLI signs in through your browser. Keys are for scripts and CI, where nobody is
              around to click a prompt. Press n to make one anyway.
            </Hint>
          </Box>
        </Box>
      ) : (
        slice.map((k) => {
          const isSelected = keys[index]?._id === k._id;
          return (
            <Box key={k._id}>
              <Text color={isSelected ? theme.accent : undefined}>{isSelected ? "❯ " : "  "}</Text>
              <Text bold={isSelected}>{k.name}</Text>
              <Hint>
                {"  "}
                {k.prefix}… · created {formatDate(k.createdAt)}
                {k.lastUsedAt ? ` · used ${formatDate(k.lastUsedAt)}` : " · never used"}
              </Hint>
            </Box>
          );
        })
      )}
      <Feedback message={message} />
    </Box>
  );
}
