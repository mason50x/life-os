import { LinkIcon } from "@heroicons/react/24/solid";
import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { capabilitiesOf, groupsFor } from "@/lib/mcpTools";
import { CopyButton } from "@/components/CopyButton";
import { CapabilityBadges, ProviderMark } from "@/components/dashboard/ProviderMark";
import {
  PageBody,
  PageHeader,
  Panel,
  Section,
  cellBorders,
} from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";
import { accountsOf, session } from "../data";

const clientGuides = [
  { name: "Claude", body: "Settings → Connectors → Add custom connector" },
  { name: "Claude Code", body: null },
  { name: "ChatGPT", body: "Settings → Connectors → Advanced → Developer mode" },
] as const;

export default async function McpConnection() {
  const { user } = await session();
  const accounts = await accountsOf(user.id);
  const mcpUrl = mcpEndpoint();

  // What this connection really advertises, not the full catalogue — the
  // endpoint gates on what the user has connected, so the page should too.
  const groups = groupsFor(capabilitiesOf(accounts));
  const extended = groups
    .filter((g) => g.tier === "extended")
    .reduce((n, g) => n + g.tools.length, 0);
  const direct = groups.reduce((n, g) => n + g.tools.length, 0) - extended;

  return (
    <>
      <PageHeader title="MCP connection" icon={LinkIcon} />

      <PageBody>
        <Section
          title="Your endpoint"
        >
          <Panel className="flex items-center gap-4 px-5 py-3.5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{mcpUrl}</code>
            <CopyButton value={mcpUrl} />
          </Panel>
        </Section>

        <Section title="Adding it to a client">
          <Panel className="grid sm:grid-cols-3">
            {clientGuides.map((guide, i) => (
              <div key={guide.name} className={cn("px-5 py-4", cellBorders(i, 3))}>
                <p className="text-sm">{guide.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {guide.body ?? (
                    <code className="font-mono break-all">
                      claude mcp add -t http lifeos {mcpUrl}
                    </code>
                  )}
                </p>
              </div>
            ))}
          </Panel>
        </Section>

        <Section
          title="What it reaches"
        >
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

        <Section title="Narrower endpoints">
          <Panel className="grid sm:grid-cols-2">
            {[
              { url: `${mcpUrl}/email`, note: "Mail only — nothing calendar." },
              { url: `${mcpUrl}/calendar`, note: "Calendar only — nothing mail." },
            ].map((entry, i) => (
              <div key={entry.url} className={cn("px-5 py-3", cellBorders(i, 2))}>
                <code className="font-mono text-sm break-all">{entry.url}</code>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{entry.note}</p>
              </div>
            ))}
          </Panel>
        </Section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          A client only sees the tools your connected accounts can answer — connect one and the rest
          appear. The everyday tools are advertised directly; the rest stay one <code>find_tools</code>{" "}
          call away, so a conversation doesn&rsquo;t carry forty schemas it isn&rsquo;t using. Append{" "}
          <code>?tools=all</code> to the endpoint if you&rsquo;d rather have them all listed.
          You&rsquo;ll sign in with your LifeOS account the first time a client connects — OAuth
          through WorkOS AuthKit, and your account credentials never reach the client. Revoking a
          client&rsquo;s access, or disconnecting an account, takes effect on the next call.
        </p>
      </PageBody>
    </>
  );
}
