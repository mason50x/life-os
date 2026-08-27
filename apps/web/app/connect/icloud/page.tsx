import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ICloudConnectForm } from "./ICloudConnectForm";

const steps = [
  {
    title: "Open your Apple Account",
    body: (
      <>
        Go to{" "}
        <a
          href="https://account.apple.com/sign-in"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          account.apple.com
        </a>{" "}
        and sign in. Your Apple Account needs two-factor authentication — if you use an iPhone,
        iPad, or Mac, it&apos;s almost certainly already on.
      </>
    ),
  },
  {
    title: "Generate an app-specific password",
    body: (
      <>
        Choose <strong className="font-medium text-foreground">Sign-In and Security</strong> →{" "}
        <strong className="font-medium text-foreground">App-Specific Passwords</strong>, press{" "}
        <strong className="font-medium text-foreground">+</strong>, and name it{" "}
        <code className="font-mono">LifeOS</code>. Apple shows the password{" "}
        <strong className="font-medium text-foreground">once</strong> — copy it right away.
      </>
    ),
  },
  {
    title: "Paste it here",
    body: (
      <>
        Enter your <strong className="font-medium text-foreground">primary</strong> iCloud
        address and the password. Using iCloud+ custom domains? List those addresses too —
        one sign-in connects all of them. We verify with a live sign-in to Apple&apos;s mail
        and calendar servers before saving anything.
      </>
    ),
  },
];

export default async function ConnectICloud({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; addresses?: string; reason?: string }>;
}) {
  const [, params] = await Promise.all([withAuth({ ensureSignedIn: true }), searchParams]);
  // Sent here by "Enable calendar" when the stored password no longer opens
  // iCloud Calendar. Everything but the password is already known, so the page
  // asks for the one thing it can't work out and says why.
  const forCalendar = params.reason === "calendar";

  return (
    <main className="mx-auto max-w-4xl px-6 pb-16 sm:pb-24">
      <nav className="flex items-center justify-between gap-3 py-6 sm:py-8">
        <BrandMenu
          render={
            <Link href="/dashboard" className="flex items-center gap-2 text-lg font-normal tracking-tight" />
          }
        >
          <Logo size={26} />
          LifeOS
        </BrandMenu>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href="/dashboard">
                <span className="max-sm:hidden">Back to dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Link>
            }
          />
        </div>
      </nav>

      <header className="mb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">iCloud</Badge>
          <Badge variant="outline">
            {forCalendar ? "Mail stays connected" : "No Apple developer account needed"}
          </Badge>
        </div>
        <h1 className="text-3xl font-thin tracking-tight sm:text-4xl">
          {forCalendar ? "Add iCloud Calendar" : "Connect iCloud"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {forCalendar ? (
            <>
              iCloud wouldn&apos;t open the calendar with the password we hold — most likely it
              was revoked at some point. Generate a fresh{" "}
              <strong className="font-medium text-foreground">app-specific password</strong> and
              paste it below; it reaches Mail and Calendar together, and your mail keeps working
              in the meantime either way.
            </>
          ) : (
            <>
              Apple doesn&apos;t offer &quot;Sign in with Apple&quot; for mail, so iCloud connects
              with an{" "}
              <strong className="font-medium text-foreground">app-specific password</strong> — a
              revocable password you create in about a minute. The one password reaches iCloud
              Mail and iCloud Calendar, and it never expires, so you&apos;ll never see a re-auth
              prompt.
            </>
          )}
        </p>
      </header>

      <div className="grid items-start gap-6 md:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Three steps, one time</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-5">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              variant="outline"
              className="mt-6 w-full"
              nativeButton={false}
              render={
                <a href="https://account.apple.com/sign-in" target="_blank" rel="noreferrer">
                  Open account.apple.com
                  <ArrowTopRightOnSquareIcon data-icon="inline-end" />
                </a>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
          </CardHeader>
          <CardContent>
            <ICloudConnectForm
              defaultEmail={params.email}
              defaultAddresses={params.addresses}
              forCalendar={forCalendar}
            />
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Like every LifeOS connection, mail and calendar pass straight through to Apple — nothing
        is stored on our side except the encrypted credential.
      </p>
    </main>
  );
}
