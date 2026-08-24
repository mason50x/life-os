// All functions are called server-to-server from the Next.js backend, which
// proves itself with a shared secret. Set it once per deployment:
//   npx convex env set LIFEOS_SERVICE_KEY <value>
export function assertServiceKey(serviceKey: string) {
  const expected = process.env.LIFEOS_SERVICE_KEY;
  if (!expected || serviceKey !== expected) {
    throw new Error("Unauthorized: invalid service key");
  }
}
