import { GmailMark, ICloudMark, OutlookMark } from "@/components/brand-marks";
import { PendingButton } from "@/components/PendingButton";
import { cn } from "@/lib/utils";

const accounts = [
  { label: "Gmail", mark: <GmailMark />, z: "z-30" },
  { label: "iCloud", mark: <ICloudMark />, z: "z-20" },
  { label: "Outlook", mark: <OutlookMark />, z: "z-10" },
];

/** The three providers as an overlapping avatar stack; leftmost sits on top. */
function AccountAvatars({ compact }: { compact: boolean }) {
  return accounts.map((a) => (
    <span
      key={a.label}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-white ring-2 ring-primary",
        compact ? "size-5" : "size-6",
        a.z,
      )}
    >
      <svg viewBox="0 0 24 24" className={compact ? "size-3.5" : "size-4"}>
        {a.mark}
      </svg>
    </span>
  ));
}

/**
 * The primary call to action. `compact` is the header's copy of it: one size
 * down, so the same object reads as the same object once it docks up there.
 *
 * The leading well is sized to the stack — each avatar overlaps the one before
 * it by 6px, so three of them come to `3w - 12`.
 */
export function ConnectButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <PendingButton
      href="/login?signup"
      className={className}
      size={compact ? "default" : "lg"}
      leading={<AccountAvatars compact={compact} />}
      leadingWidth={compact ? "mr-2 w-12" : "mr-2.5 w-15"}
    >
      Connect my Accounts
    </PendingButton>
  );
}
