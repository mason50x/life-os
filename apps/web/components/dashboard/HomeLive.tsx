"use client";

import { ArrowPathIcon, InboxIcon, PlusIcon } from "@heroicons/react/24/outline";
// The /accounts subpath is the account types and their pure helpers with none
// of the provider clients behind the main entry — this is a client component,
// and the IMAP/CalDAV stacks don't resolve (or belong) in a browser bundle.
import {
  MAX_ACCOUNT_NICKNAME,
  accountNames,
  defaultAccountName,
  type ConnectedAccount,
} from "@lifeos/core/accounts";
import { disconnectAccount } from "@/app/dashboard/actions";
import { AccountName } from "@/components/dashboard/AccountName";
import { AddAccountMenu } from "@/components/dashboard/AddAccountMenu";
import { EnableCalendarButton } from "@/components/dashboard/EnableCalendarButton";
import {
  CapabilityBadges,
  ProviderMark,
  connectHref,
  providerCapabilities,
  providerLabel,
} from "@/components/dashboard/ProviderMark";
import { Panel, Section, Stat, cellBorders } from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveAccounts, useLiveKeys } from "./live";

/**
 * The half of the home page that describes what's connected — the stat row
 * and the account list — subscribed to Convex. The server-rendered snapshot
 * passed in paints first; from then on a connect finishing in another tab, a
 * rename from the CLI, or a key minted anywhere shows up as it happens.
 */
export function HomeLive({
  initialAccounts,
  initialKeys,
}: {
  initialAccounts: ConnectedAccount[];
  /** Only the count shows here; the full rows live on /dashboard/keys. */
  initialKeys: { _id: string }[];
}) {
  const accounts: ConnectedAccount[] = useLiveAccounts(initialAccounts);
  const keyCount = useLiveKeys(initialKeys).length;

  const providers = [...new Set(accounts.map((a) => providerLabel[a.provider]))];
  const names = accountNames(accounts);
  // Counted by calendar, not by address: iCloud aliases share one.
  const calendars = accounts.filter(
    (a) => a.capabilities.includes("calendar") && !a.calendarOf,
  ).length;

  return (
    <>
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
          value={String(keyCount)}
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
            <span className="text-xs text-muted-foreground">{calendars} with calendar</span>
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
                  "group flex scroll-mt-20 items-center gap-4 px-5 py-3.5",
                  i > 0 && "border-t",
                )}
              >
                <ProviderMark provider={a.provider} className="size-5" />
                <div className="min-w-0 flex-1">
                  <AccountName
                    id={a.id}
                    name={names.get(a.email) ?? a.email}
                    nickname={a.nickname}
                    defaultName={defaultAccountName(a.email)}
                    maxLength={MAX_ACCOUNT_NICKNAME}
                  />
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email} · {providerLabel[a.provider]} · connected{" "}
                    {new Date(a.connectedAt).toLocaleDateString()}
                    {/* Its own inbox, somebody else's calendar: one Apple
                        sign-in has one set of calendars however many
                        addresses send through it. */}
                    {a.calendarOf && ` · calendar via ${names.get(a.calendarOf) ?? a.calendarOf}`}
                  </p>
                </div>
                <CapabilityBadges
                  capabilities={a.capabilities}
                  calendarOf={a.calendarOf}
                  className="hidden sm:flex"
                />
                {/* An account linked before calendar existed holds a mail-only
                    grant — but usually a credential that reaches the calendar
                    anyway. This asks the provider before it asks the user. */}
                {a.status === "active" &&
                !a.capabilities.includes("calendar") &&
                !a.calendarOf &&
                providerCapabilities[a.provider].includes("calendar") ? (
                  <EnableCalendarButton id={a.id} />
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
                <form action={disconnectAccount.bind(null, a.id)}>
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
    </>
  );
}
