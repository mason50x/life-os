/**
 * Monochrome, with indigo reserved for the one thing that is selected or
 * active — brand/README.md treats the accent as an accent, not a palette.
 */
export const theme = {
  accent: "#6366f1",
  muted: "gray",
  ok: "green",
  warn: "yellow",
  bad: "red",
} as const;

export const STATUS = {
  active: { dot: "●", color: theme.ok, label: "active" },
  needs_reauth: { dot: "●", color: theme.warn, label: "needs reauth" },
  disconnected: { dot: "○", color: theme.muted, label: "disconnected" },
} as const;

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
