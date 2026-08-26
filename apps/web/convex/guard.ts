// All functions are called server-to-server from the Next.js backend, which
// proves itself with a shared secret. Set it once per deployment:
//   npx convex env set LIFEOS_SERVICE_KEY <value>
//
// This key is the only thing between the public internet and every user's
// encrypted tokens: Convex `query`/`mutation` are internet-reachable, and the
// deployment URL ships to the browser as NEXT_PUBLIC_CONVEX_URL. The repo being
// public means the function names and argument shapes are public too, so the
// comparison below must not leak the expected value one byte at a time.

/**
 * Compare without an early exit, so how long a rejection takes says nothing
 * about how much of the guess was right. Written by hand rather than with
 * `crypto.timingSafeEqual`: Convex's default runtime is a V8 isolate with no
 * `node:crypto`, and pulling this file into the Node runtime would drag every
 * caller with it.
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Folded in rather than checked up front — a wrong-length guess should cost
  // the same as a wrong-value one.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    // charCodeAt past the end is NaN, and `| 0` turns that into a stable 0.
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

export function assertServiceKey(serviceKey: string) {
  const expected = process.env.LIFEOS_SERVICE_KEY;
  if (!expected || !timingSafeEqual(serviceKey, expected)) {
    throw new Error("Unauthorized: invalid service key");
  }
}
