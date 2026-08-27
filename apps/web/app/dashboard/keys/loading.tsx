import { KeysShell, KeysSkeleton } from "./parts";

/**
 * Static, so the router can prefetch it: clicking "API keys" paints the whole
 * page at once and the round trip is only ever spent on the list itself.
 * Without this the generic dashboard skeleton stood in, and the page arrived
 * as a different shape than the one it replaced.
 */
export default function Loading() {
  return (
    <KeysShell>
      <KeysSkeleton />
    </KeysShell>
  );
}
