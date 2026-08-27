import { Box, Text } from "ink";
import { Sidebar, type NavItem } from "./Sidebar.js";
import { theme } from "./theme.js";

/** Below this the header drops identity so the content pane stays usable. */
const COLLAPSE_BELOW = 72;

/**
 * The frame every screen renders inside: a title bar, the rail, the content
 * pane, and one line of keys. It's sized to the terminal exactly, so nothing
 * scrolls except what a screen chooses to scroll.
 */
export function Layout({
  columns,
  rows,
  nav,
  current,
  navFocused,
  instance,
  identity,
  updateAvailable,
  keys,
  children,
}: {
  columns: number;
  rows: number;
  nav: NavItem[];
  current: string;
  navFocused: boolean;
  instance: string;
  identity?: string;
  updateAvailable?: string | null;
  keys: string;
  children: React.ReactNode;
}) {
  const collapsed = columns < COLLAPSE_BELOW;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box
        borderStyle="round"
        borderColor={theme.muted}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Text bold color={theme.accent}>
            LifeOS
          </Text>
          {identity && !collapsed ? <Text color={theme.muted}> {identity}</Text> : null}
        </Box>
        <Text color={theme.muted}>{collapsed ? "" : instance}</Text>
      </Box>

      <Box flexGrow={1} overflow="hidden">
        <Sidebar items={nav} current={current} focused={navFocused} />
        <Box
          flexGrow={1}
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          borderStyle="round"
          borderColor={theme.muted}
          borderTop={false}
          borderBottom={false}
          borderRight={false}
        >
          {children}
        </Box>
      </Box>

      <Box
        borderStyle="round"
        borderColor={theme.muted}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={theme.muted}>{keys}</Text>
        {updateAvailable ? (
          <Text color={theme.accent}>update {updateAvailable} · u</Text>
        ) : (
          <Text color={theme.muted}>? help</Text>
        )}
      </Box>
    </Box>
  );
}
