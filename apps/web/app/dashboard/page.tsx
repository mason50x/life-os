import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { listAccounts } from "@/lib/accounts";
import { api, convex, convexAsUser, serviceKey } from "@/lib/convex";
import { appUrl } from "@/lib/env";
import { CopyButton } from "@/components/CopyButton";
import { KeyManager } from "@/components/KeyManager";
import { Logo } from "@/components/Logo";
import { disconnectAccount } from "./actions";

const providerMeta = {
  gmail: { label: "Gmail", badge: "bg-red-400/15 text-red-300" },
  outlook: { label: "Outlook", badge: "bg-sky-400/15 text-sky-300" },
} as const;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  const params = await searchParams;

  // Mirror the WorkOS user into Convex (JWT-authenticated; non-fatal on failure).
  if (accessToken) {
    await convexAsUser(accessToken)
      .mutation(api.users.syncFromWorkOS, {
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        profilePictureUrl: user.profilePictureUrl ?? undefined,
      })
      .catch((e) => console.error("users.syncFromWorkOS failed:", e));
  }

  const [accounts, keys] = await Promise.all([
    listAccounts(user.id),
    convex().query(api.apiKeys.listByUser, {
      serviceKey: serviceKey(),
      userId: user.id,
    }) as Promise<{ _id: string; name: string; prefix: string; createdAt: number }[]>,
  ]);
  const mcpUrl = `${appUrl()}/mcp`;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24">
      <nav className="flex items-center justify-between py-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo size={26} />
          Life<span className="text-indigo-400">OS</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <span>{user.email}</span>
          {/* POST via server action — a GET /logout link gets prefetched by
              Next.js and silently destroys the session on dashboard render. */}
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@workos-inc/authkit-nextjs");
              await signOut({ returnTo: "/" });
            }}
          >
            <button className="btn-ghost !px-3 !py-1.5 text-xs">Sign out</button>
          </form>
        </div>
      </nav>

      {params.connected && (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
          Connected {params.connected} 🎉
        </div>
      )}
      {params.error && (
        <div className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          Connection failed: {params.error}
        </div>
      )}

      <section className="card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Connected accounts</h2>
            <p className="text-sm text-zinc-400">
              Connect as many inboxes as you like — they all flow through one MCP connection.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/connect/google" className="btn-ghost !px-4 !py-2 text-xs">
              + Gmail
            </a>
            <a href="/api/connect/microsoft" className="btn-ghost !px-4 !py-2 text-xs">
              + Outlook
            </a>
          </div>
        </div>

        {accounts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">
            No accounts yet. Connect your first inbox above.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${providerMeta[a.provider].badge}`}
                  >
                    {providerMeta[a.provider].label}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{a.email}</p>
                    <p className="text-xs text-zinc-500">
                      {a.status === "active" ? (
                        <span className="text-emerald-400">● active</span>
                      ) : (
                        <span className="text-amber-400">● needs re-auth</span>
                      )}
                    </p>
                  </div>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await disconnectAccount(a.id);
                  }}
                >
                  <button className="text-xs text-zinc-500 transition hover:text-red-400">
                    Disconnect
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Your MCP connection</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Add this URL to any MCP client. You&apos;ll sign in with your LifeOS account the first
          time — OAuth is handled automatically.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <code className="break-all font-mono text-sm text-indigo-300">{mcpUrl}</code>
          <CopyButton value={mcpUrl} />
        </div>
        <div className="mt-4 grid gap-3 text-xs text-zinc-400 sm:grid-cols-3">
          <div className="rounded-lg bg-white/[0.03] p-3">
            <p className="mb-1 font-semibold text-zinc-300">Claude</p>
            Settings → Connectors → Add custom connector
          </div>
          <div className="rounded-lg bg-white/[0.03] p-3">
            <p className="mb-1 font-semibold text-zinc-300">Claude Code</p>
            <code className="break-all">claude mcp add -t http lifeos {mcpUrl}</code>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-3">
            <p className="mb-1 font-semibold text-zinc-300">ChatGPT</p>
            Settings → Connectors → Advanced → Developer mode
          </div>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">API keys</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
          For the <code className="font-mono text-indigo-300">lifeos</code> CLI. Run{" "}
          <code className="font-mono text-indigo-300">lifeos login</code> and paste a key.
        </p>
        <KeyManager keys={keys} />
      </section>
    </main>
  );
}
