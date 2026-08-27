import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Logo } from "@/components/Logo";

const errors: Record<string, string> = {
  expired: "That link expired. Run the command again from your terminal.",
  wrong_account:
    "You're signed in here as a different LifeOS account than the one your terminal is signed into. Sign out, sign back in as the right one, and try again.",
  invalid_oauth_state: "The sign-in didn't complete safely. Run the command again.",
  connect_failed: "The provider wouldn't hand over the mailbox. Run the command again.",
  access_denied: "You declined the permission prompt. Nothing was connected.",
};

/**
 * Where the OAuth callback lands when a terminal, not the dashboard, started
 * the connect. The CLI is already polling for the new account, so this page has
 * one job: tell the person the browser is finished with them.
 */
export default async function CliDone({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const failed = Boolean(error);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <Logo />

      {failed ? (
        <ExclamationTriangleIcon className="mt-10 size-8 text-muted-foreground" aria-hidden />
      ) : (
        <CheckCircleIcon className="mt-10 size-8" aria-hidden />
      )}

      <h1 className="mt-5 text-2xl font-normal tracking-tighter">
        {failed ? "That didn't connect" : "Connected"}
      </h1>

      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {failed
          ? (errors[error ?? ""] ?? "Something went wrong. Run the command again from your terminal.")
          : connected
            ? `${connected} is now reachable over MCP.`
            : "Your mailbox is now reachable over MCP."}
      </p>

      <p className="mt-10 font-mono text-xs tracking-widest text-muted-foreground uppercase">
        You can close this tab
      </p>
    </main>
  );
}
