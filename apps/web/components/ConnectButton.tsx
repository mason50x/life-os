import { GmailMark, ICloudMark, OutlookMark } from "@/components/brand-marks";
import { PendingButton } from "@/components/PendingButton";
import { cn } from "@/lib/utils";

const accounts = [
  { label: "Gmail", mark: <GmailMark />, z: "z-30" },
  { label: "iCloud", mark: <ICloudMark />, z: "z-20" },
  { label: "Outlook", mark: <OutlookMark />, z: "z-10" },
];

/** The three providers as an overlapping avatar stack; leftmost sits on top. */
function AccountAvatars() {
  return accounts.map((a) => (
    <span
      key={a.label}
      className={cn(
        "relative inline-flex size-6 items-center justify-center rounded-full bg-white ring-2 ring-primary",
        a.z,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4">
        {a.mark}
      </svg>
    </span>
  ));
}

export function ConnectButton() {
  return (
    <PendingButton href="/login?signup" leading={<AccountAvatars />} leadingWidth="mr-2.5 w-15">
      Connect my Accounts
    </PendingButton>
  );
}
