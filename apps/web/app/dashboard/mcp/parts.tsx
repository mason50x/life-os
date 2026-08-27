import { LinkIcon } from "@heroicons/react/24/solid";
import { CopyButton } from "@/components/CopyButton";
import {
  Bar,
  PageBody,
  PageHeader,
  Panel,
  Section,
  cellBorders,
} from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";

const clientGuides = [
  { name: "Claude", body: "Settings → Connectors → Add custom connector" },
  { name: "Claude Code", body: null },
  { name: "ChatGPT", body: "Settings → Connectors → Advanced → Developer mode" },
] as const;

/**
 * The page minus the two sections that describe what's connected. Everything
 * here is the endpoint and how to reach it — known without a read, so the
 * page and its loading state render it identically and a click lands on the
 * finished layout.
 */
export function McpShell({ mcpUrl, children }: { mcpUrl: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="MCP connection" icon={LinkIcon} />

      <PageBody>
        <Section title="Your endpoint">
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

        {children}

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

/** The two sections that wait on the account list, held at their own size. */
export function McpReachSkeleton() {
  return (
    <>
      <Section title="What it reaches">
        <Panel className="grid sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={cn("flex items-center gap-3 px-5 py-3", cellBorders(i, 2))}>
              <Bar className="size-4 shrink-0" />
              <Bar className="h-3.5 flex-1" />
              <Bar className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </Panel>
      </Section>

      <Section title="Tools on the wire">
        <div className="space-y-5">
          {[0, 1].map((group) => (
            <div key={group}>
              <Bar className="mb-2 h-3 w-32" />
              <Panel className="grid sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn("space-y-2 px-5 py-3", cellBorders(i, 2))}>
                    <Bar className="h-3.5 w-28" />
                    <Bar className="h-2.5 w-48 max-w-full" />
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
