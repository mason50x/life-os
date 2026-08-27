import Link from "next/link";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { HomeIcon } from "@heroicons/react/24/solid";
import { HomeLive } from "@/components/dashboard/HomeLive";
import { PageBody, PageHeader } from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";
import { accountsOf, keysOf, session } from "./data";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; calendar?: string; error?: string }>;
}) {
  const [{ user }, params] = await Promise.all([session(), searchParams]);
  const [accounts, keys] = await Promise.all([accountsOf(user.id), keysOf(user.id)]);

  return (
    <>
      <PageHeader title="Home" icon={HomeIcon} />

      <PageBody>
        {(params.connected || params.calendar || params.error) && (
          <Banner
            connected={params.connected}
            calendar={params.calendar}
            error={params.error}
          />
        )}

        {/* Stats and the account list, rendered from this snapshot and then
            subscribed to Convex — see HomeLive. */}
        <HomeLive initialAccounts={accounts} initialKeys={keys} />
      </PageBody>
    </>
  );
}

function Banner({
  connected,
  calendar,
  error,
}: {
  connected?: string;
  calendar?: string;
  error?: string;
}) {
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
      {bad
        ? `Connection failed: ${error}`
        : calendar
          ? `Calendar enabled on ${calendar}`
          : `Connected ${connected}`}
      <Link
        href="/dashboard"
        className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Dismiss
      </Link>
    </div>
  );
}
