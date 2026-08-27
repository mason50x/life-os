import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  CalendarDaysIcon,
  CommandLineIcon,
  InboxStackIcon,
  KeyIcon,
  LinkIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import { ConnectButton } from "@/components/ConnectButton";
import { Cross } from "@/components/Cross";
import { PendingButton } from "@/components/PendingButton";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { FlowDiagram } from "@/components/FlowDiagram";
import { HeaderConnectCta } from "@/components/HeaderConnectCta";
import { MobileNav } from "@/components/MobileNav";
import { McpReaderTrigger, ReaderShell } from "@/components/McpReader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const steps = [
  {
    n: "01",
    title: "Connect your accounts",
    body: "Sign in and link every Gmail, Outlook, and iCloud account you own. Google and iCloud bring their calendars along with their mail.",
  },
  {
    n: "02",
    title: "Add one MCP URL",
    body: "Paste your LifeOS endpoint into Claude, ChatGPT, Cursor, or any MCP client — or run a single CLI command.",
  },
  {
    n: "03",
    title: "Just ask",
    body: "“What did my landlord say last week?” “Am I free Thursday afternoon?” Your AI reads every account at once and answers.",
  },
];

const features = [
  {
    icon: ShieldCheckIcon,
    title: "Nothing stored",
    body: "LifeOS never stores your mail or your calendar. Requests pass straight through to Gmail, Google Calendar, Outlook, or iCloud and back.",
  },
  {
    icon: InboxStackIcon,
    title: "Every inbox, all of it",
    body: "Search threads, read messages, manage labels, archive, draft, and send \u2014 on every account you connect.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Every calendar too",
    body: "List calendars, find gaps that are actually free, create and move events, invite people, RSVP \u2014 across every account at once.",
  },
  {
    icon: LinkIcon,
    title: "One URL, every client",
    body: "One MCP endpoint works everywhere MCP does: Claude, ChatGPT, Claude Code, Cursor, and whatever ships next.",
  },
  {
    icon: KeyIcon,
    title: "Auth done properly",
    body: "OAuth end to end with WorkOS AuthKit for Google and Microsoft; iCloud app-specific passwords stay encrypted. Credentials never reach your AI tools.",
  },
  {
    icon: CommandLineIcon,
    title: "Dashboard and CLI",
    body: "A dashboard for humans, a lifeos CLI for terminals. Same accounts, same connection.",
  },
];

/** Footer links are 20px of text; on touch they get a 44px row to land in. */
const footerLink =
  "transition-colors hover:text-foreground max-sm:flex max-sm:h-11 max-sm:items-center";

export default async function Home() {
  // Reading the session makes this route dynamic; signed-in users skip the pitch.
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  return (
    <ReaderShell>
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <nav className="page-col flex h-16 items-center justify-between border-x px-6">
          <BrandMenu
            render={
              <a
                href="#top"
                aria-label="LifeOS — back to top"
                className="group/logo -m-2 flex items-center gap-2 p-2 text-lg font-normal tracking-tight"
              />
            }
          >
            <Logo size={26} interactive />
            LifeOS
          </BrandMenu>
          {/* No gap here: the docked CTA carries its own leading space, so it
              collapses to nothing at the top of the page rather than leaving a
              gap behind. */}
          <div className="flex items-center">
            <PendingButton href="/login" variant="ghost" size="default" className="max-sm:hidden">
              Sign in
            </PendingButton>
            <HeaderConnectCta watch="hero-cta" />
            <MobileNav className="sm:hidden" />
          </div>
        </nav>
      </header>

      <main className="page-col flex-1 border-x">
        {/* Hero — copy left, flow diagram right */}
        <section>
          <div className="grid items-center gap-x-8 gap-y-12 px-6 py-14 sm:gap-y-16 sm:px-10 sm:py-20 lg:grid-cols-2 lg:py-24">
            <div>
              <h1 className="text-balance text-[2.75rem]/[1.05] font-normal tracking-tighter sm:text-6xl sm:leading-none xl:text-7xl">
                Your life,
                <br />
                one connection.
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:mt-6 sm:text-lg">
                LifeOS turns your email accounts and their calendars into one MCP. One
                connection, persistent across all your services.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center">
                <span id="hero-cta" className="flex w-full sm:w-auto">
                  <ConnectButton className="h-11 w-full sm:h-9 sm:w-auto" />
                </span>
                <McpReaderTrigger />
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <FlowDiagram />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <SectionHeading title="Three steps, then it disappears" />
          <div className="grid border-t sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.n} className={cn("px-6 py-10 sm:px-10 sm:py-20", i > 0 && "border-t sm:border-l sm:border-t-0")}>
                <span className="text-sm tabular-nums text-muted-foreground">{s.n}</span>
                <h3 className="mt-3 text-lg font-normal">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <SectionHeading title="Built like infrastructure, not another inbox" />
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-background px-6 py-10 sm:px-10 sm:py-20">
                <f.icon className="size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 text-lg font-normal">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-center px-6 py-24 text-center sm:py-40">
          <h2 className="text-balance text-3xl font-normal tracking-tighter sm:text-5xl">
            Connect once. Then just ask.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            We&rsquo;re free for now, until we can&rsquo;t afford to cover the costs. Let&rsquo;s get
            you setup now!
          </p>
          <div className="mt-8 w-full max-w-xs sm:w-auto">
            <PendingButton href="/login?signup" className="h-11 w-full sm:h-9 sm:w-auto">
              Get started
            </PendingButton>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="page-col flex flex-col justify-between gap-6 border-x px-6 py-10 sm:flex-row sm:items-center sm:py-16">
          <BrandMenu render={<span className="group/logo flex w-fit items-center gap-2 text-sm" />}>
            <Logo size={20} interactive />
            LifeOS
          </BrandMenu>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground max-sm:gap-y-0">
            <Link href="/privacy" className={footerLink}>
              Privacy
            </Link>
            <Link href="/terms" className={footerLink}>
              Terms
            </Link>
            <a href="/support" className={footerLink}>
              Support
            </a>
            <a
              href="https://cognify.design"
              target="_blank"
              rel="noreferrer"
              className={footerLink}
            >
              © {new Date().getFullYear()} Cognify
            </a>
            {/* The icon button carries 8px of its own padding — pull it back in
                so the gap after "Cognify" and the flush right edge both read
                the same 24px as the text links. */}
            <span className="-mx-2 -my-1.5">
              <ThemeToggle className="max-sm:size-11" />
            </span>
          </div>
        </div>
      </footer>
    </ReaderShell>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="px-6 pt-16 pb-8 sm:px-10 sm:pt-40 sm:pb-12">
      <h2 className="text-2xl font-normal tracking-tighter sm:text-4xl">{title}</h2>
    </div>
  );
}
