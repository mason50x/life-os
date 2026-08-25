import { LinkIcon } from "@heroicons/react/24/solid";
import { mcpUrl as mcpEndpoint } from "@/lib/env";
import { CopyButton } from "@/components/CopyButton";
import { ProviderMark, providerLabel } from "@/components/dashboard/ProviderMark";
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

/** The tools `/mcp` exposes, in the order a client tends to reach for them. */
const tools = [
  ["list_accounts", "Which inboxes are connected, and what each one is."],
  ["search_emails", "Search one account or every account at once."],
  ["get_thread", "A whole conversation, bodies included."],
  ["get_message", "One message with its full body."],
  ["send_email", "Send from any connected address."],
  ["create_draft", "Leave a draft in the mailbox to review."],
  ["archive_email", "Out of the inbox, still in the account."],
  ["trash_email", "To trash — recoverable, never a hard delete."],
  ["mark_read", "Read or unread."],
  ["list_labels", "Gmail labels, Outlook and iCloud folders."],
  ["modify_labels", "Relabel, or move between folders."],
] as const;

export default async function McpConnection() {
  const { user } = await session();
  const accounts = await accountsOf(user.id);
  const mcpUrl = mcpEndpoint();

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
                Nothing connected yet — the endpoint works, it just has no inboxes to answer with.
              </p>
            ) : (
              accounts.map((a, i) => (
                <div
                  key={a.id}
                  className={cn("flex items-center gap-3 px-5 py-3", cellBorders(i, 2))}
                >
                  <ProviderMark provider={a.provider} />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.status === "active" ? providerLabel[a.provider] : "Needs re-auth"}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </Section>

        <Section
          title="Tools on the wire"
        >
          <Panel className="grid sm:grid-cols-2">
            {tools.map(([name, what], i) => (
              <div key={name} className={cn("px-5 py-3", cellBorders(i, 2))}>
                <code className="font-mono text-sm">{name}</code>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{what}</p>
              </div>
            ))}
          </Panel>
        </Section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          You&rsquo;ll sign in with your LifeOS account the first time a client connects — OAuth
          through WorkOS AuthKit, and your mail credentials never reach the client. Revoking a
          client&rsquo;s access, or disconnecting an inbox, takes effect on the next call.
        </p>
      </PageBody>
    </>
  );
}
