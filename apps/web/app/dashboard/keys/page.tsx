import { Suspense } from "react";
import { KeyManager } from "@/components/KeyManager";
import { keysOf, session } from "../data";
import { KeysShell, KeysSkeleton } from "./parts";

export default function ApiKeys() {
  return (
    <KeysShell>
      <Suspense fallback={<KeysSkeleton />}>
        <Keys />
      </Suspense>
    </KeysShell>
  );
}

/**
 * The only part that waits on Convex, kept behind its own boundary so the
 * rest of the page doesn't wait with it.
 */
async function Keys() {
  const { user } = await session();
  return <KeyManager keys={await keysOf(user.id)} />;
}
