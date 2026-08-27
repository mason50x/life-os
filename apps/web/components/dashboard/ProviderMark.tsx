import { Fragment } from "react";
import type { Capability, Provider } from "@lifeos/core";
import { CalendarDaysIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import {
  CalendarDaysIcon as CalendarDaysSolid,
  EnvelopeIcon as EnvelopeSolid,
} from "@heroicons/react/24/solid";
import { GmailMark, ICloudMark, OutlookMark } from "@/components/brand-marks";
import { cn } from "@/lib/utils";

const marks = { gmail: GmailMark, outlook: OutlookMark, icloud: ICloudMark } as const;

export const providerLabel = { gmail: "Gmail", outlook: "Outlook", icloud: "iCloud" } as const;

/** What connecting each provider actually brings. Outlook is mail-only for now. */
export const providerCapabilities: Record<Provider, Capability[]> = {
  gmail: ["email", "calendar"],
  outlook: ["email"],
  icloud: ["email", "calendar"],
};

/**
 * Where a new account starts, and where a stale one goes to be renewed. Gmail
 * and Outlook hand straight off to their OAuth routes; iCloud needs an
 * app-specific password, so it stops at a page first.
 */
export const connectRoutes: { provider: Provider; href: string }[] = [
  { provider: "gmail", href: "/api/connect/google" },
  { provider: "outlook", href: "/api/connect/microsoft" },
  { provider: "icloud", href: "/connect/icloud" },
];

const capabilityIcon = { email: EnvelopeIcon, calendar: CalendarDaysIcon } as const;
export const capabilityLabel = { email: "Mail", calendar: "Calendar" } as const;

/**
 * What one connected account is good for, at a glance. `calendarOf` names the
 * account whose calendar this one shares — an iCloud alias has a calendar, but
 * it's the same one its sibling shows, and badging both would count it twice.
 */
export function CapabilityBadges({
  capabilities,
  calendarOf,
  className,
}: {
  capabilities: Capability[];
  calendarOf?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {(["email", "calendar"] as const)
        .filter((c) => capabilities.includes(c) && !(c === "calendar" && calendarOf))
        .map((c) => {
          const Icon = capabilityIcon[c];
          return (
            <span key={c} className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {capabilityLabel[c]}
            </span>
          );
        })}
    </span>
  );
}

/**
 * Filled twins of the badge icons, one hue each. Colour is doing the work the
 * labels used to: two solid shapes in a menu row are told apart by their tint
 * before they're told apart by their outline. Indigo is the UI accent; amber
 * is simply the furthest thing from it that still holds on both themes.
 */
const capabilitySolid = { email: EnvelopeSolid, calendar: CalendarDaysSolid } as const;
const capabilityTint = { email: "text-indigo-500", calendar: "text-amber-500" } as const;

/**
 * The same thing CapabilityBadges says, without the words: an envelope, a
 * calendar, or both joined by a plus. In a menu the labels would be the same
 * two words down every row, and the marks read faster than they do.
 */
export function CapabilityIcons({
  capabilities,
  className,
}: {
  capabilities: Capability[];
  className?: string;
}) {
  const has = (["email", "calendar"] as const).filter((c) => capabilities.includes(c));
  return (
    <span
      className={cn("flex items-center gap-1 text-muted-foreground", className)}
      aria-label={has.map((c) => capabilityLabel[c]).join(" and ")}
    >
      {has.map((c, i) => {
        const Icon = capabilitySolid[c];
        return (
          <Fragment key={c}>
            {i > 0 && (
              <span aria-hidden className="text-xs">
                +
              </span>
            )}
            <Icon className={cn("size-4", capabilityTint[c])} aria-hidden />
          </Fragment>
        );
      })}
    </span>
  );
}

export function connectHref(provider: Provider) {
  return connectRoutes.find((r) => r.provider === provider)?.href ?? "/dashboard";
}

/** The vendor mark for a connected account, normalized to a 24×24 box. */
export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
  const Mark = marks[provider];
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} aria-hidden>
      <Mark />
    </svg>
  );
}
