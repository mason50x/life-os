import { Box, Text } from "ink";
import { NAV_SPRITES, SPRITE_WIDTH } from "./sprites.js";
import { theme } from "./theme.js";

export interface NavItem {
  key: string;
  label: string;
  /** Shown to the right of the label, e.g. an account count or a warning dot. */
  badge?: { text: string; color?: string };
}

export const SIDEBAR_WIDTH = 15;
/** Marker plus one sprite — the labels are what a collapsed rail drops. */
const COLLAPSED_WIDTH = 1 + SPRITE_WIDTH;

/**
 * The rail. Selection is the current screen — there is no separate "open",
 * so moving through it moves through the app.
 */
export function Sidebar({
  items,
  current,
  focused,
  collapsed,
}: {
  items: NavItem[];
  current: string;
  focused: boolean;
  collapsed: boolean;
}) {
  return (
    <Box
      flexDirection="column"
      width={collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH}
      flexShrink={0}
      paddingY={1}
    >
      {items.map((item) => {
        const active = item.key === current;
        // Reserve the width even for a key with no sprite, so nothing shifts.
        const icon = (NAV_SPRITES[item.key] ?? "").padEnd(SPRITE_WIDTH);
        return (
          <Box key={item.key}>
            <Text color={active ? theme.accent : undefined}>{active ? "▌" : " "}</Text>
            <Text color={active ? theme.accent : theme.muted}>{icon}</Text>
            {collapsed ? null : (
              <>
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
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
