import { Box, Text } from "ink";
import { theme } from "./theme.js";

export interface NavItem {
  key: string;
  label: string;
  /** Shown to the right of the label, e.g. an account count or a warning dot. */
  badge?: { text: string; color?: string };
}

export const SIDEBAR_WIDTH = 15;

/**
 * The rail. Selection is the current screen — there is no separate "open",
 * so moving through it moves through the app.
 */
export function Sidebar({
  items,
  current,
  focused,
}: {
  items: NavItem[];
  current: string;
  focused: boolean;
}) {
  return (
    <Box flexDirection="column" width={SIDEBAR_WIDTH} flexShrink={0} paddingY={1}>
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Box key={item.key}>
            <Text color={active ? theme.accent : undefined}>{active ? "▌" : " "}</Text>
            <Text
              color={active ? theme.accent : focused ? undefined : theme.muted}
              bold={active}
            >
              {" "}
              {item.label}
            </Text>
            {item.badge ? (
              <Text color={item.badge.color ?? theme.muted}> {item.badge.text}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
