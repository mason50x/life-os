"use client";

import { useEffect, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
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
import { useTheme } from "next-themes";
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
import { ProviderMark, connectHref, providerCapabilities } from "./ProviderMark";

export interface SidebarAccount {
  id: string;
  email: string;
  provider: Provider;
  status: "active" | "needs_reauth" | "disconnected";
  capabilities: Capability[];
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
 * The collapsed state rides in a cookie so the server can render the right
 * width on the first paint — a client-only toggle would flash the wrong one.
 */
export function AppSidebar({
  user,
  accounts,
  defaultCollapsed = false,
  signOut,
}: {
  user: SidebarUser;
  accounts: SidebarAccount[];
  defaultCollapsed?: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [emailOpen, setEmailOpen] = useState(true);

  const calendars = accounts.filter((a) => a.capabilities.includes("calendar"));
  // Mail-only accounts on a provider that also does calendar: one reconnect
  // away, and the only reason the section would be shorter than the one above.
  const pending = accounts.filter(
    (a) =>
      a.status === "active" &&
      !a.capabilities.includes("calendar") &&
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
        "z-40 flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
        "transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        collapsed ? "w-14" : "w-64",
      )}
    >
      {/* Header — mark, wordmark, and the handle that folds the rail away. */}
      <div className="flex h-16 shrink-0 items-center border-b px-2.5">
        {collapsed ? (
          <RailButton label="Expand sidebar" onClick={toggle} className="group/logo">
            <Logo size={20} interactive />
          </RailButton>
        ) : (
          <>
            <Link
              href="/"
              className="group/logo -m-1.5 flex items-center gap-2 p-1.5 text-base tracking-tight"
            >
              <BrandMenu>
                <Logo size={22} interactive />
              </BrandMenu>
              LifeOS
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              className="ml-auto flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelIcon />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto p-2">
        <RailLink
          href="/dashboard"
          icon={HomeIcon}
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
            <span className="font-mono text-[0.7rem] text-muted-foreground">{accounts.length}</span>
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
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {calendars.length}
            </span>
          }
        >
          {calendars.map((a) => (
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

          {/* An account linked before calendar existed holds a mail-only grant.
              Reconnecting is additive — the same consent screen, one more tick. */}
          {pending.map((a) => (
            <a
              key={a.id}
              href={connectHref(a.provider)}
              title={`Enable calendar for ${a.email}`}
              className="flex h-8 items-center gap-2.5 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ProviderMark provider={a.provider} className="opacity-40" />
              <span className="truncate">{a.email}</span>
              <Badge
                variant="secondary"
                className="ml-auto h-4 shrink-0 px-1.5 text-[0.65rem] font-normal"
              >
                Enable
              </Badge>
            </a>
          ))}

          {calendars.length === 0 && pending.length === 0 && (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Connect a Google or iCloud account and its calendar comes with it — the same
              connection, the same pass-through promise.
            </p>
          )}
        </Section>

        <div className="my-2 h-px bg-border" />

        <RailLink
          href="/dashboard/mcp"
          icon={LinkIcon}
          label="MCP connection"
          collapsed={collapsed}
          active={pathname === "/dashboard/mcp"}
        />
        <RailLink
          href="/dashboard/keys"
          icon={KeyIcon}
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
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title={collapsed ? label : undefined}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 text-sm transition-colors hover:bg-muted",
          collapsed ? "justify-center px-0" : "px-2",
        )}
      >
        <Icon className="size-4.5 shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {trailing}
              <ChevronRightIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                  expanded && "rotate-90",
                )}
              />
            </span>
          </>
        )}
      </button>

      {/* 0fr → 1fr animates a height the browser can't otherwise interpolate. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="ml-[1.1rem] border-l pl-1.5" inert={expanded ? undefined : true}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A flat nav row that survives collapsing by dropping to its icon. The page
 * you're on is marked by a full-height bar on the leading edge — the one place
 * in a zero-radius, monochrome UI where a fill would read as decoration.
 */
function RailLink({
  href,
  icon: Icon,
  label,
  collapsed,
  active,
}: {
  href: string;
  icon: typeof KeyIcon;
  label: string;
  collapsed: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 text-sm transition-colors hover:bg-muted",
        collapsed ? "justify-center px-0" : "px-2",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-foreground" aria-hidden />}
      <RailIcon icon={Icon} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/**
 * The icon, or a spinner while its page is on the way. Dashboard routes are
 * dynamic, so a click always costs a round trip — this says which row you hit
 * before the new page arrives. Must live inside the `<Link>` to read it.
 */
function RailIcon({ icon: Icon }: { icon: typeof KeyIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Spinner className="size-4.5 shrink-0" />
  ) : (
    <Icon className="size-4.5 shrink-0" />
  );
}

function RailButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center transition-colors hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
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
            className={cn(
              "flex w-full items-center gap-2.5 text-left transition-colors hover:bg-muted aria-expanded:bg-muted",
              collapsed ? "h-9 justify-center px-0" : "h-11 px-2",
            )}
          >
            <Avatar user={user} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{user.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            )}
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
