import Link from "next/link";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { HomeIcon } from "@heroicons/react/24/solid";
import { AddAccountMenu } from "@/components/dashboard/AddAccountMenu";
import {
  CapabilityBadges,
  ProviderMark,
  connectHref,
  providerCapabilities,
  providerLabel,
} from "@/components/dashboard/ProviderMark";
import {
  PageBody,
  PageHeader,
  Panel,
  Section,
  Stat,
  cellBorders,
} from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { disconnectAccount } from "./actions";
import { accountsOf, keysOf, session } from "./data";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [{ user }, params] = await Promise.all([session(), searchParams]);
  const [accounts, keys] = await Promise.all([accountsOf(user.id), keysOf(user.id)]);
  const providers = [...new Set(accounts.map((a) => providerLabel[a.provider]))];
  const calendars = accounts.filter((a) => a.capabilities.includes("calendar")).length;

  return (
    <>
      <PageHeader title="Home" icon={HomeIcon} />

      <PageBody>
        {(params.connected || params.error) && (
          <Banner connected={params.connected} error={params.error} />
        )}

        {/* The three numbers worth glancing at, two of them a way through. */}
        <Panel className="grid sm:grid-cols-3">
          <Stat
            label="Accounts"
            value={String(accounts.length)}
            note={providers.length ? providers.join(" · ") : "Nothing connected"}
          />
          <Stat
            label="Connection"
            value="Live"
            note="MCP · streamable HTTP"
            href="/dashboard/mcp"
            dot
            className={cellBorders(1, 3)}
          />
          <Stat
            label="API keys"
            value={String(keys.length)}
            note="For the lifeos CLI"
            href="/dashboard/keys"
            className={cellBorders(2, 3)}
          />
        </Panel>

        <Section
          id="inboxes"
          title="Accounts"
          action={
            accounts.length ? (
              <span className="text-xs text-muted-foreground">
                {calendars} with calendar
              </span>
            ) : undefined
          }
        >
          <Panel>
            {accounts.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-14 text-center">
                <InboxIcon className="size-6 text-muted-foreground" aria-hidden />
                <p className="mt-4 text-sm">No accounts yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Connect your first account and your AI client can search its mail and read its
                  calendar a minute later.
                </p>
                <div className="mt-6">
                  <AddAccountMenu align="center">
                    <Button type="button">
                      <PlusIcon data-icon="inline-start" />
                      Connect an account
                    </Button>
                  </AddAccountMenu>
                </div>
              </div>
            ) : (
              accounts.map((a, i) => (
                <div
                  key={a.id}
                  id={`account-${a.id}`}
                  className={cn(
                    "flex scroll-mt-20 items-center gap-4 px-5 py-3.5",
                    i > 0 && "border-t",
                  )}
                >
                  <ProviderMark provider={a.provider} className="size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {providerLabel[a.provider]} · connected{" "}
                      {new Date(a.connectedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <CapabilityBadges capabilities={a.capabilities} className="hidden sm:flex" />
                  {/* An account linked before calendar existed holds a mail-only
                      grant. Reconnecting is additive — the same flow, one more tick. */}
                  {a.status === "active" &&
                  !a.capabilities.includes("calendar") &&
                  providerCapabilities[a.provider].includes("calendar") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<a href={connectHref(a.provider)} />}
                    >
                      <CalendarDaysIcon data-icon="inline-start" />
                      Enable calendar
                    </Button>
                  ) : a.status === "active" ? (
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
                      Active
                    </span>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      nativeButton={false}
                      render={<a href={connectHref(a.provider)} />}
                    >
                      <ArrowPathIcon data-icon="inline-start" />
                      Reconnect
                    </Button>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await disconnectAccount(a.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Disconnect
                    </Button>
                  </form>
                </div>
              ))
            )}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

function Banner({ connected, error }: { connected?: string; error?: string }) {
  const bad = Boolean(error);
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border px-5 py-3 text-sm",
        bad ? "border-destructive/30 text-destructive" : "text-foreground",
      )}
    >
      {bad ? (
        <ExclamationTriangleIcon className="size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircleIcon className="size-4 shrink-0" aria-hidden />
      )}
      {bad ? `Connection failed: ${error}` : `Connected ${connected}`}
      <Link
        href="/dashboard"
        className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Dismiss
      </Link>
    </div>
  );
}
