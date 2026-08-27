"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Capability, Provider } from "@lifeos/core";
import {
  ArrowLeftStartOnRectangleIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  EnvelopeIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  KeyIcon as KeyIconSolid,
  LinkIcon as LinkIconSolid,
} from "@heroicons/react/24/solid";
import { useTheme } from "next-themes";
import { enableCalendarAction } from "@/app/dashboard/actions";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AddAccountMenu } from "./AddAccountMenu";
import { useLiveAccounts } from "./live";
import { ProviderMark, providerCapabilities } from "./ProviderMark";

export interface SidebarAccount {
  id: string;
  email: string;
  provider: Provider;
  status: "active" | "needs_reauth" | "disconnected";
  capabilities: Capability[];
  /** Set when this address's calendar is another account's — see ConnectedAccount. */
  calendarOf?: string;
}

export interface SidebarUser {
  name: string;
  email: string;
  avatarUrl?: string;
}

/**
 * The dashboard's left rail. Two widths, one layout: collapsing swaps the
 * 16rem panel for a 3.5rem icon rail rather than re-rendering a second tree,
 * so nothing inside remounts and the sections keep whatever they had open.
 *
 * Folding is one movement, and only the panel makes it. A row's ground belongs
 * to the rail and narrows with it; everything the row carries is fixed to the
 * open width and stays exactly where it is, so no label re-wraps, re-truncates
 * or slides, and every icon is already sitting on the closed rail's centre line
 * before the edge arrives. What the narrow rail has no room for fades out ahead
 * of the edge and back in behind it; the edge does the rest of the work.
 *
 * The collapsed state rides in a cookie so the server can render the right
 * width on the first paint — a client-only toggle would flash the wrong one.
 */
export function AppSidebar({
  user,
  accounts: initialAccounts,
  defaultCollapsed = false,
  signOut,
}: {
  user: SidebarUser;
  /** Server-rendered snapshot; the live subscription takes over once it answers. */
  accounts: SidebarAccount[];
  defaultCollapsed?: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [emailOpen, setEmailOpen] = useState(true);

  // Live: a connect finishing in another tab, a rename from the CLI, a revoked
  // grant — the rail follows without a navigation.
  const accounts: SidebarAccount[] = useLiveAccounts(initialAccounts);

  // The calendar list is by connection, not by address: iCloud aliases are
  // three inboxes above and one Apple calendar here, so only the account that
  // stands for a shared calendar is listed — with a count of who else is on it.
  const calendars = accounts.filter((a) => a.capabilities.includes("calendar") && !a.calendarOf);
  const sharing = (owner: SidebarAccount) =>
    accounts.filter((a) => a.calendarOf === owner.email).length;
  // Mail-only accounts on a provider that also does calendar: one click away,
  // and the only reason the section would be shorter than the one above.
  const pending = accounts.filter(
    (a) =>
      a.status === "active" &&
      !a.capabilities.includes("calendar") &&
      !a.calendarOf &&
      providerCapabilities[a.provider].includes("calendar"),
  );
  const [calendarOpen, setCalendarOpen] = useState(calendars.length > 0);

  function toggle() {
    setCollapsed((c) => {
      document.cookie = `lifeos-sidebar=${c ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }

  /** Collapsed rail icons expand the panel and reveal the section they name. */
  function reveal(open: (v: boolean) => void) {
    if (!collapsed) return;
    toggle();
    open(true);
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "z-40 flex shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground",
        "transition-[width] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        collapsed ? "w-14" : "w-64",
      )}
    >
      {/* Header — mark, wordmark, and the handle that folds the rail away. One
          lockup at either width: the mark keeps its slot, and the closed rail
          hands it the job the fold-away button does while there's room. */}
      <div className="flex h-16 w-64 shrink-0 items-center border-b px-2.5">
        <BrandMenu
          render={
            <Link
              href="/"
              aria-label={collapsed ? "Expand sidebar" : undefined}
              title={collapsed ? "Expand sidebar" : undefined}
              onClick={
                collapsed
                  ? (e) => {
                      e.preventDefault();
                      toggle();
                    }
                  : undefined
              }
              className="group/logo flex items-center gap-1.5 text-base tracking-tight"
            />
          }
        >
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Logo size={20} interactive />
          </span>
          <Fade collapsed={collapsed}>LifeOS</Fade>
        </BrandMenu>
        <Fade collapsed={collapsed} className="ml-auto flex">
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            inert={collapsed ? true : undefined}
            className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelIcon />
          </button>
        </Fade>
      </div>

      {/* gap-1 keeps every row an island: the current page's fill and a
          neighbour's hover fill never meet to read as one block. */}
      <nav className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2">
        <RailLink
          href="/dashboard"
          icon={HomeIcon}
          activeIcon={HomeIconSolid}
          label="Home"
          collapsed={collapsed}
          active={pathname === "/dashboard"}
        />

        {/* Email — every connected inbox, and the way to add another. */}
        <Section
          icon={EnvelopeIcon}
          label="Email"
          collapsed={collapsed}
          open={emailOpen}
          onToggle={() => (collapsed ? reveal(setEmailOpen) : setEmailOpen((o) => !o))}
          trailing={
            <span className="text-xs tabular-nums text-muted-foreground">{accounts.length}</span>
          }
        >
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/dashboard#account-${a.id}`}
              title={a.email}
              className="flex h-8 items-center gap-2.5 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ProviderMark provider={a.provider} />
              <span className="truncate">{a.email}</span>
              {a.status !== "active" && (
                <span
                  aria-label="Needs re-auth"
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
                />
              )}
            </Link>
          ))}
          <AddAccountMenu align="start" side="right">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2.5 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
            >
              <PlusIcon className="size-4 shrink-0" />
              Add account
            </button>
          </AddAccountMenu>
        </Section>

        {/* Calendar — the same accounts, listed by the other thing they grant. */}
        <Section
          icon={CalendarDaysIcon}
          label="Calendar"
          collapsed={collapsed}
          open={calendarOpen}
          onToggle={() => (collapsed ? reveal(setCalendarOpen) : setCalendarOpen((o) => !o))}
          trailing={
            <span className="text-xs tabular-nums text-muted-foreground">
              {calendars.length}
            </span>
          }
        >
          {calendars.map((a) => {
            const others = sharing(a);
            return (
              <Link
                key={a.id}
                href={`/dashboard#account-${a.id}`}
                title={
                  others
                    ? `${a.email} — one calendar, shared with ${others} more ${
                        others === 1 ? "address" : "addresses"
                      } on this sign-in`
                    : a.email
                }
                className="flex h-8 items-center gap-2.5 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ProviderMark provider={a.provider} />
                <span className="truncate">{a.email}</span>
                {/* One sign-in, several send-as addresses: say so rather than
                    listing a calendar that doesn't exist separately. */}
                {others > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                    +{others}
                  </span>
                )}
                {a.status !== "active" && (
                  <span
                    aria-label="Needs re-auth"
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
                  />
                )}
              </Link>
            );
          })}

          {/* An account linked before calendar existed holds a mail-only grant,
              though usually a credential that reaches the calendar anyway —
              enabling asks the provider first and the user only if that fails. */}
          {pending.map((a) => (
            <form key={a.id} action={enableCalendarAction.bind(null, a.id)}>
              <EnableRow provider={a.provider} email={a.email} />
            </form>
          ))}

          {calendars.length === 0 && pending.length === 0 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Connect a Google or iCloud account and its calendar comes with it — the same
              connection, the same pass-through promise.
            </p>
          )}
        </Section>

        <div className="my-1 h-px bg-border" />

        <RailLink
          href="/dashboard/mcp"
          icon={LinkIcon}
          activeIcon={LinkIconSolid}
          label="MCP connection"
          collapsed={collapsed}
          active={pathname === "/dashboard/mcp"}
        />
        <RailLink
          href="/dashboard/keys"
          icon={KeyIcon}
          activeIcon={KeyIconSolid}
          label="API keys"
          collapsed={collapsed}
          active={pathname === "/dashboard/keys"}
        />
      </nav>

      {/* Footer — who's signed in, plus theme and the way out. */}
      <div className="shrink-0 border-t p-2">
        <UserMenu user={user} collapsed={collapsed} signOut={signOut} />
      </div>
    </aside>
  );
}

/** A collapsible group: header row always visible, body height-animated. */
function Section({
  icon: Icon,
  label,
  collapsed,
  open,
  onToggle,
  trailing,
  children,
}: {
  icon: typeof EnvelopeIcon;
  label: string;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const expanded = open && !collapsed;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title={collapsed ? label : undefined}
        className="flex h-9 w-full items-center gap-2.5 px-[0.6875rem] text-sm transition-colors hover:bg-muted"
      >
        <Icon className="size-4.5 shrink-0" />
        <Fade collapsed={collapsed} className="w-35 shrink-0 truncate text-left">
          {label}
        </Fade>
        <Fade collapsed={collapsed} className="flex w-10 shrink-0 items-center justify-end gap-1.5">
          {trailing}
          <ChevronRightIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </Fade>
      </button>

      {/* 0fr → 1fr animates a height the browser can't otherwise interpolate.
          It runs on the panel's own curve and clock, so the rows on their way
          out and the edge closing over them arrive together. */}
      <div
        className="grid transition-[grid-template-rows] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            // What the open panel leaves after the indent and the rule, fixed
            // rather than measured: an address truncates once and stays put.
            className={cn(
              "mt-1 ml-[1.25rem] flex w-[13.6875rem] flex-col gap-1 border-l pl-1.5",
              fading(collapsed),
            )}
            inert={expanded ? undefined : true}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A flat nav row that survives collapsing by dropping to its icon. The page
 * you're on is marked from the inside — tinted ground, weighted label, and the
 * icon swapped to its solid cut — rather than by a rule down the leading edge.
 */
function RailLink({
  href,
  icon: Icon,
  activeIcon,
  label,
  collapsed,
  active,
}: {
  href: string;
  icon: typeof KeyIcon;
  activeIcon: typeof KeyIcon;
  label: string;
  collapsed: boolean;
  active?: boolean;
}) {
  const RailIconEl = active ? activeIcon : Icon;

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 px-[0.6875rem] text-sm transition-colors hover:bg-muted",
        active
          ? "bg-muted font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <RailIconEl className="size-4.5 shrink-0" />
      <Fade collapsed={collapsed} className="w-40 shrink-0 truncate">
        {label}
      </Fade>
    </Link>
  );
}

/**
 * One mail-only account, offering the calendar it doesn't have yet. Enabling
 * goes out to Apple or Google with the credential on file, which takes long
 * enough that the row has to say it's working.
 */
function EnableRow({ provider, email }: { provider: Provider; email: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Enable calendar for ${email}`}
      className="flex h-8 w-full items-center gap-2.5 px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ProviderMark provider={provider} className="opacity-40" />
      <span className="truncate">{email}</span>
      {pending ? (
        <Spinner className="ml-auto size-3 shrink-0" />
      ) : (
        <Badge
          variant="secondary"
          className="ml-auto h-4 shrink-0 px-1.5 text-[0.65rem] font-normal"
        >
          Enable
        </Badge>
      )}
    </button>
  );
}

/**
 * A part of the open panel that the narrow rail has no room for. It keeps its
 * place in the layout at either width — moving it would fight the one movement
 * the fold is allowed — and instead leaves ahead of the closing edge and comes
 * back behind the opening one, which is why the two directions time differently.
 */
function Fade({
  collapsed,
  className,
  children,
}: {
  collapsed: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn(fading(collapsed), className)}>{children}</span>;
}

/** `Fade`'s classes, for the parts of the panel that can't take a `<span>`. */
function fading(collapsed: boolean) {
  return cn(
    "transition-opacity ease-out motion-reduce:transition-none",
    collapsed ? "opacity-0 duration-150" : "opacity-100 duration-150 delay-75",
  );
}

/** A panel with its left rail picked out — the thing the button folds. */
function PanelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" stroke="currentColor" />
      <path d="M6 2.5v11" stroke="currentColor" />
    </svg>
  );
}

function UserMenu({
  user,
  collapsed,
  signOut,
}: {
  user: SidebarUser;
  collapsed: boolean;
  signOut: () => Promise<void>;
}) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  // next-themes only knows the resolved theme on the client; reading it during
  // the server render would mark the wrong item and trip hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={collapsed ? user.email : undefined}
            // px-1.5 against the rows' px-[0.6875rem]: the avatar is wider than
            // a nav icon, and it is the centre lines that have to agree.
            className="flex h-11 w-full items-center gap-2.5 px-1.5 text-left transition-colors hover:bg-muted aria-expanded:bg-muted"
          >
            <Avatar user={user} />
            <Fade collapsed={collapsed} className="w-46 shrink-0">
              <span className="block truncate text-sm">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </Fade>
          </button>
        }
      />
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 py-1.5">
            <Avatar user={user} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-normal">{user.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={(v) => setTheme(String(v))}
        >
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light">
            <SunIcon className="size-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon className="size-4" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <ComputerDesktopIcon className="size-4" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* POST-equivalent: a GET /logout link gets prefetched and would sign
              the user out while the dashboard is still rendering. */}
          <DropdownMenuItem
            disabled={pending}
            onClick={() => startTransition(async () => void (await signOut()))}
          >
            <ArrowLeftStartOnRectangleIcon className="size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ user }: { user: SidebarUser }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- WorkOS serves these
    // from a host we'd have to allowlist in next.config for next/image.
    <img
      src={user.avatarUrl}
      alt=""
      width={28}
      height={28}
      className="size-7 shrink-0 object-cover"
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center bg-foreground text-xs font-medium text-background">
      {initials(user.name || user.email)}
    </span>
  );
}

function initials(from: string) {
  const parts = from.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
