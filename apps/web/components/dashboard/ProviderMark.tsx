import type { Capability, Provider } from "@lifeos/core";
import { CalendarDaysIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
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
export const connectRoutes: { provider: Provider; href: string; note: string }[] = [
  { provider: "gmail", href: "/api/connect/google", note: "Mail · Calendar" },
  { provider: "outlook", href: "/api/connect/microsoft", note: "Mail" },
  { provider: "icloud", href: "/connect/icloud", note: "Mail · Calendar" },
];

const capabilityIcon = { email: EnvelopeIcon, calendar: CalendarDaysIcon } as const;
export const capabilityLabel = { email: "Mail", calendar: "Calendar" } as const;

/** What one connected account is good for, at a glance. */
export function CapabilityBadges({
  capabilities,
  className,
}: {
  capabilities: Capability[];
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {(["email", "calendar"] as const)
        .filter((c) => capabilities.includes(c))
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
