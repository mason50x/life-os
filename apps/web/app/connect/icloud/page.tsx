import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ExternalLink } from "lucide-react";
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
        servers before saving anything.
      </>
    ),
  },
];

export default async function ConnectICloud() {
  await withAuth({ ensureSignedIn: true });

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24">
      <nav className="flex items-center justify-between py-8">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-normal tracking-tight">
          <BrandMenu>
            <Logo size={26} />
          </BrandMenu>
          LifeOS
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/dashboard">Back to dashboard</Link>}
          />
        </div>
      </nav>

      <header className="mb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">iCloud</Badge>
          <Badge variant="outline">No Apple developer account needed</Badge>
        </div>
        <h1 className="text-4xl font-thin tracking-tight">Connect iCloud Mail</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Apple doesn&apos;t offer &quot;Sign in with Apple&quot; for mail, so iCloud connects
          with an <strong className="font-medium text-foreground">app-specific password</strong>{" "}
          — a revocable, mail-only password you create in about a minute. It never expires, so
          you&apos;ll never see a re-auth prompt.
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
                  <ExternalLink data-icon="inline-end" />
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
            <ICloudConnectForm />
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Like every LifeOS connection, mail passes straight through to Apple — nothing is stored
        on our side except the encrypted credential.
      </p>
    </main>
  );
}
