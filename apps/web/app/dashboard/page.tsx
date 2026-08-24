import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { listAccounts } from "@/lib/accounts";
import { api, convex, convexAsUser, serviceKey } from "@/lib/convex";
import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { CopyButton } from "@/components/CopyButton";
import { KeyManager } from "@/components/KeyManager";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { disconnectAccount } from "./actions";

const providerLabel = { gmail: "Gmail", outlook: "Outlook", icloud: "iCloud" } as const;

const clientGuides = [
  { name: "Claude", body: "Settings → Connectors → Add custom connector" },
  { name: "Claude Code", body: null },
  { name: "ChatGPT", body: "Settings → Connectors → Advanced → Developer mode" },
] as const;

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
  const mcpUrl = mcpEndpoint();

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24">
      <nav className="flex items-center justify-between py-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-normal tracking-tight">
          <Logo size={26} />
          LifeOS
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <ThemeToggle />
          {/* POST via server action — a GET /logout link gets prefetched by
              Next.js and silently destroys the session on dashboard render. */}
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@workos-inc/authkit-nextjs");
              await signOut({ returnTo: "/" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </nav>

      {params.connected && (
        <Alert className="mb-6">
          <CheckCircle2 />
          <AlertTitle>Connected {params.connected}</AlertTitle>
        </Alert>
      )}
      {params.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Connection failed: {params.error}</AlertTitle>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Connect as many inboxes as you like — they all flow through one MCP connection.
          </CardDescription>
          <CardAction className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href="/api/connect/google">+ Gmail</a>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href="/api/connect/microsoft">+ Outlook</a>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/connect/icloud">+ iCloud</Link>}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No accounts yet</EmptyTitle>
                <EmptyDescription>Connect your first inbox above.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {accounts.map((a, i) => (
                <div key={a.id}>
                  {i > 0 && <ItemSeparator />}
                  <Item size="sm" className="px-0">
                    <ItemMedia>
                      <Badge variant="outline">{providerLabel[a.provider]}</Badge>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{a.email}</ItemTitle>
                      <ItemDescription>
                        {a.status === "active" ? "Active" : "Needs re-auth"}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {a.status !== "active" && <Badge variant="destructive">Re-auth</Badge>}
                      <form
                        action={async () => {
                          "use server";
                          await disconnectAccount(a.id);
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          Disconnect
                        </Button>
                      </form>
                    </ItemActions>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your MCP connection</CardTitle>
          <CardDescription>
            Add this URL to any MCP client. You&apos;ll sign in with your LifeOS account the first
            time — OAuth is handled automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Item variant="muted">
            <ItemContent>
              <code className="break-all font-mono text-sm">{mcpUrl}</code>
            </ItemContent>
            <ItemActions>
              <CopyButton value={mcpUrl} />
            </ItemActions>
          </Item>
          <div className="grid gap-3 sm:grid-cols-3">
            {clientGuides.map((guide) => (
              <Item key={guide.name} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>{guide.name}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {guide.body ?? (
                      <code className="break-all font-mono">
                        claude mcp add -t http lifeos {mcpUrl}
                      </code>
                    )}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            For the <code className="font-mono">lifeos</code> CLI. Run{" "}
            <code className="font-mono">lifeos login</code> and paste a key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeyManager keys={keys} />
        </CardContent>
      </Card>
    </main>
  );
}
