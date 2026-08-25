import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import TextInput from "ink-text-input";
import { STATUS, theme } from "./theme.js";
import type { AccountStatus } from "../lib/types.js";

export function StatusDot({ status }: { status: AccountStatus }) {
  const s = STATUS[status] ?? STATUS.disconnected;
  return <Text color={s.color}>{s.dot}</Text>;
}

export function StatusText({ status }: { status: AccountStatus }) {
  const s = STATUS[status] ?? STATUS.disconnected;
  return <Text color={s.color}>{s.label}</Text>;
}

/** A screen's title row, so every screen starts at the same place. */
export function ScreenTitle({ title, note }: { title: string; note?: string }) {
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text bold>{title}</Text>
      {note ? <Text color={theme.muted}>{note}</Text> : null}
    </Box>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <Text color={theme.muted}>{children}</Text>;
}

/** Result of the last action, cleared by the next one. */
export function Feedback({ message }: { message: { text: string; bad?: boolean } | null }) {
  if (!message) return null;
  return (
    <Box marginTop={1}>
      <Text color={message.bad ? theme.bad : theme.ok}>
        {message.bad ? "✗" : "✓"} {message.text}
      </Text>
    </Box>
  );
}

/**
 * Ink has no spinner of its own and the packaged ones pull in a dependency for
 * ten frames of animation. This is those ten frames.
 */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text color={theme.accent}>
      {FRAMES[frame]}
      {label ? <Text color={theme.muted}> {label}</Text> : null}
    </Text>
  );
}

/**
 * A destructive action asks for the thing itself to be typed, not for a
 * keystroke: disconnecting the wrong inbox is a minute of re-authorizing, and
 * `y` is one finger away from every other key.
 */
export function TypeToConfirm({
  prompt,
  expected,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  expected: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  const matches = value.trim() === expected;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {prompt} Type <Text color={theme.accent}>{expected}</Text> to confirm.
      </Text>
      <Box marginTop={1}>
        <Text color={theme.muted}>❯ </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => matches && onConfirm()}
          placeholder=""
        />
      </Box>
      <Box marginTop={1}>
        <Hint>{matches ? "enter to confirm · esc to cancel" : "esc to cancel"}</Hint>
      </Box>
    </Box>
  );
}

/** One labelled input in a multi-field form. */
export function Field({
  label,
  value,
  onChange,
  onSubmit,
  focused,
  mask,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  focused: boolean;
  mask?: boolean;
  placeholder?: string;
}) {
  return (
    <Box>
      <Box width={12}>
        <Text color={focused ? theme.accent : theme.muted}>{label}</Text>
      </Box>
      {focused ? (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask={mask ? "•" : undefined}
          placeholder={placeholder}
        />
      ) : (
        <Text color={value ? undefined : theme.muted}>
          {value ? (mask ? "•".repeat(value.length) : value) : (placeholder ?? "")}
        </Text>
      )}
    </Box>
  );
}
