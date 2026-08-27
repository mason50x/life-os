import { Suspense } from "react";
import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { capabilitiesOf, groupsFor } from "@/lib/mcpTools";
import { CapabilityBadges, ProviderMark } from "@/components/dashboard/ProviderMark";
import { Panel, Section, cellBorders } from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";
import { accountsOf, session } from "../data";
import { McpReachSkeleton, McpShell } from "./parts";

export default function McpConnection() {
  return (
    <McpShell mcpUrl={mcpEndpoint()}>
      <Suspense fallback={<McpReachSkeleton />}>
        <Reach />
      </Suspense>
    </McpShell>
  );
}

/**
 * The half of the page that depends on what's connected, behind its own
 * boundary: the endpoint and the instructions above it don't wait on Convex.
 */
async function Reach() {
  const { user } = await session();
  const accounts = await accountsOf(user.id);

  // What this connection really advertises, not the full catalogue — the
  // endpoint gates on what the user has connected, so the page should too.
  const groups = groupsFor(capabilitiesOf(accounts));
  const extended = groups
    .filter((g) => g.tier === "extended")
    .reduce((n, g) => n + g.tools.length, 0);
  const direct = groups.reduce((n, g) => n + g.tools.length, 0) - extended;

  return (
    <>
      <Section title="What it reaches">
        <Panel className={accounts.length ? "grid sm:grid-cols-2" : undefined}>
          {accounts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              Nothing connected yet — the endpoint works, it just has no accounts to answer with.
            </p>
          ) : (
            accounts.map((a, i) => (
              <div
                key={a.id}
                className={cn("flex items-center gap-3 px-5 py-3", cellBorders(i, 2))}
              >
                <ProviderMark provider={a.provider} />
                <span className="min-w-0 flex-1 truncate text-sm">{a.email}</span>
                {a.status === "active" ? (
                  <CapabilityBadges capabilities={a.capabilities} />
                ) : (
                  <span className="text-xs text-muted-foreground">Needs re-auth</span>
                )}
              </div>
            ))
          )}
        </Panel>
      </Section>

      <Section
        title="Tools on the wire"
        action={
          <span className="text-xs text-muted-foreground">
            {extended ? `${direct} advertised · ${extended} via find_tools` : `${direct} tools`}
          </span>
        }
      >
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                {group.title}
                {group.tier === "extended" && (
                  <span className="normal-case tracking-normal">via find_tools</span>
                )}
              </p>
              <Panel className="grid sm:grid-cols-2">
                {group.tools.map(([name, what], i) => (
                  <div key={name} className={cn("px-5 py-3", cellBorders(i, 2))}>
                    <code className="font-mono text-sm">{name}</code>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{what}</p>
                  </div>
                ))}
              </Panel>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
