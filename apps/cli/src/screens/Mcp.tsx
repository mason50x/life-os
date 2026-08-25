import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { Feedback, Hint, ScreenTitle, Spinner } from "../ui/components.js";
import { theme } from "../ui/theme.js";
import { copyToClipboard, hasCommand } from "../lib/platform.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROVIDER_LABEL, type McpInfo } from "../lib/types.js";
import type { ScreenProps } from "./types.js";

const run = promisify(execFile);

export const MCP_KEYS = "c copy url · i install into Claude Code";

export function Mcp({ client, focused }: ScreenProps) {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    client
      .mcp()
      .then(setInfo)
      .catch((e: unknown) =>
        setMessage({ text: e instanceof Error ? e.message : String(e), bad: true }),
      );
  }, [client]);

  /**
   * Only Claude Code gets installed for you: it has a documented command for
   * exactly this. The other clients keep their own config files, and editing
   * somebody's app config behind their back is not a shortcut worth taking.
   */
  const install = useCallback(async () => {
    if (!info) return;
    setInstalling(true);
    setMessage(null);
    try {
      if (!(await hasCommand("claude"))) {
        throw new Error("The `claude` command isn't on your PATH.");
      }
      await run("claude", ["mcp", "add", "-t", "http", "lifeos", info.url]);
      setMessage({ text: "Added to Claude Code as `lifeos`." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
    setInstalling(false);
  }, [info]);

  useInput(
    (input) => {
      if (!info) return;
      if (input === "c") {
        void copyToClipboard(info.url).then((copied) =>
          setMessage(
            copied
              ? { text: "Endpoint copied." }
              : { text: "No clipboard command available.", bad: true },
          ),
        );
      }
      if (input === "i") void install();
    },
    { isActive: focused },
  );

  if (!info) {
    return message ? <Feedback message={message} /> : <Spinner label="loading" />;
  }

  return (
    <Box flexDirection="column">
      <ScreenTitle title="MCP connection" note={`${info.tools.length} tools`} />

      <Text color={theme.accent}>{info.url}</Text>
      <Box marginTop={1}>
        <Hint>claude mcp add -t http lifeos {info.url}</Hint>
      </Box>
      <Box>
        <Hint>Claude and ChatGPT: Settings → Connectors → add a custom connector</Hint>
      </Box>

      <Box marginTop={1}>
        <Text bold>Reaches</Text>
      </Box>
      {info.reaches.length === 0 ? (
        <Hint>nothing yet — the endpoint works, it just has no inboxes to answer with</Hint>
      ) : (
        info.reaches.map((a) => (
          <Box key={a.email}>
            <Text color={a.status === "active" ? theme.ok : theme.warn}>● </Text>
            <Text>{a.email}</Text>
            <Hint> {PROVIDER_LABEL[a.provider]}</Hint>
          </Box>
        ))
      )}

      {installing ? (
        <Box marginTop={1}>
          <Spinner label="adding to Claude Code" />
        </Box>
      ) : (
        <Feedback message={message} />
      )}
    </Box>
  );
}
