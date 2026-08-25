import type { Provider } from "@lifeos/core";
import { GmailMark, ICloudMark, OutlookMark } from "@/components/brand-marks";
import { cn } from "@/lib/utils";

const marks = { gmail: GmailMark, outlook: OutlookMark, icloud: ICloudMark } as const;

export const providerLabel = { gmail: "Gmail", outlook: "Outlook", icloud: "iCloud" } as const;

/**
 * Where a new inbox starts, and where a stale one goes to be renewed. Gmail
 * and Outlook hand straight off to their OAuth routes; iCloud needs an
 * app-specific password, so it stops at a page first.
 */
export const connectRoutes: { provider: Provider; href: string; note: string }[] = [
  { provider: "gmail", href: "/api/connect/google", note: "Google · OAuth" },
  { provider: "outlook", href: "/api/connect/microsoft", note: "Microsoft · OAuth" },
  { provider: "icloud", href: "/connect/icloud", note: "Apple · app password" },
];

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
