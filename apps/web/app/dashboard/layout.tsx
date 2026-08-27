import { cookies } from "next/headers";
import { after } from "next/server";
import { api, convexAsUser } from "@/lib/convex";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { accountsOf, session } from "./data";
import { signOutAction } from "./actions";

/**
 * The shell every dashboard page renders into: rail on the left, page in the
 * column beside it. Session and account list are fetched here and reused by
 * the page inside (both are request-cached), so the sidebar is identical
 * across navigations and only the column re-renders.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = await session();

  // Mirror the WorkOS user into Convex (JWT-authenticated; non-fatal on
  // failure). Nothing on the page reads the result, so it runs after the
  // response is streamed — awaiting a write here put a whole Convex round
  // trip in front of every single navigation.
  if (accessToken) {
    after(() =>
      convexAsUser(accessToken)
        .mutation(api.users.syncFromWorkOS, {
          email: user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          profilePictureUrl: user.profilePictureUrl ?? undefined,
        })
        .catch((e) => console.error("users.syncFromWorkOS failed:", e)),
    );
  }

  const [accounts, jar] = await Promise.all([accountsOf(user.id), cookies()]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar
        user={{
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          email: user.email,
          avatarUrl: user.profilePictureUrl ?? undefined,
        }}
        accounts={accounts.map((a) => ({
          id: a.id,
          email: a.email,
          provider: a.provider,
          status: a.status,
          capabilities: a.capabilities,
        }))}
        defaultCollapsed={jar.get("lifeos-sidebar")?.value === "collapsed"}
        signOut={signOutAction}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
